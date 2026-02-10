/**
 * Fingerprint History Service
 *
 * Tracks fingerprint changes per user over time for:
 * - Impossible travel detection
 * - Device change tracking
 * - Browser update detection
 * - Location history analysis
 * - VPN usage patterns
 *
 * Uses Loki as the primary data source for historical queries.
 * All external dependencies are injected via the config module.
 *
 * @module services/FingerprintHistoryService
 */

import { getScopedLogger, getFingerprintConfig } from '../config.js';
import type { EnrichedFingerprint } from '../types/fingerprint.js';

const logger = getScopedLogger('fingerprint-history');

/**
 * Historical fingerprint record.
 */
export interface FingerprintHistory {
  timestamp: string;
  fingerprintId: string;
  fingerprintHash: string;
  userId: string;
  sessionId: string;

  // Location data
  location: {
    country: string;
    countryCode: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  } | null;

  // Device/Browser context
  deviceType: string;
  userAgent: string;

  // VPN status
  vpnDetected: boolean;

  // Event type
  eventType: string;
}

/**
 * Location change analysis.
 */
export interface LocationChange {
  from: {
    country: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timestamp: string;
  };
  to: {
    country: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timestamp: string;
  };
  distanceKm: number;
  timeElapsedMs: number;
  isImpossible: boolean;
  reason: string;
}

/**
 * Fingerprint change detection.
 */
export interface FingerprintChange {
  timestamp: string;
  changeType: 'new_device' | 'browser_update' | 'vpn_toggle' | 'fingerprint_change';
  oldFingerprint: string;
  newFingerprint: string;
  details: string;
}

/**
 * User activity summary for security analysis.
 */
export interface UserActivitySummary {
  totalEvents: number;
  uniqueDevices: number;
  uniqueLocations: number;
  uniqueFingerprints: number;
  vpnPercentage: number;
  impossibleTravelIncidents: number;
  fingerprintChanges: number;
  suspiciousActivityScore: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Returns distance in kilometers.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if travel between two locations is impossible.
 * Considers both distance and time elapsed.
 */
export function isImpossibleTravel(
  distanceKm: number,
  timeElapsedMs: number
): { impossible: boolean; reason: string } {
  const hours = timeElapsedMs / (1000 * 60 * 60);

  // If same location (< 50km), not impossible
  if (distanceKm < 50) {
    return { impossible: false, reason: '' };
  }

  // Calculate required speed (km/h)
  const requiredSpeed = distanceKm / hours;

  if (hours < 1) {
    // Short time window - stricter threshold (train/car speed)
    if (requiredSpeed > 500) {
      return {
        impossible: true,
        reason: `Travel of ${distanceKm.toFixed(0)}km in ${(hours * 60).toFixed(0)} minutes requires ${requiredSpeed.toFixed(0)}km/h (exceeds ground transport speed)`
      };
    }
  } else {
    // Longer time window - allow for air travel
    if (requiredSpeed > 900) {
      return {
        impossible: true,
        reason: `Travel of ${distanceKm.toFixed(0)}km in ${hours.toFixed(1)} hours requires ${requiredSpeed.toFixed(0)}km/h (exceeds commercial aircraft speed)`
      };
    }
  }

  return { impossible: false, reason: '' };
}

/**
 * Fingerprint History Service.
 * Query and analyze fingerprint history from Loki.
 */
export class FingerprintHistoryService {
  private lokiUrl: string;

  constructor() {
    const config = getFingerprintConfig();
    this.lokiUrl = config.lokiUrl ?? 'http://localhost:3100';
  }

  /**
   * Get recent fingerprint history for a user.
   */
  async getRecentHistory(
    userId: string,
    limit: number = 10,
    timeRangeHours: number = 168 // 7 days
  ): Promise<FingerprintHistory[]> {
    try {
      const end = Date.now();
      const start = end - (timeRangeHours * 60 * 60 * 1000);

      const query = `{job="stonewall-observability"} | json | component="fingerprint-enrichment" | user_id="${userId}"`;
      const url = `${this.lokiUrl}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}000000&end=${end}000000&limit=${limit}`;

      logger.info('Fetching fingerprint history from Loki', { userId, limit: limit.toString(), timeRangeHours: timeRangeHours.toString() });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Loki query failed: ${response.statusText}`);
      }

      const data = await response.json();

      const history: FingerprintHistory[] = [];
      if (data.data?.result) {
        for (const stream of data.data.result) {
          for (const [timestamp, logLine] of stream.values) {
            try {
              const parsed = JSON.parse(logLine as string);

              history.push({
                timestamp: new Date(parseInt(timestamp as string) / 1000000).toISOString(),
                fingerprintId: parsed.fingerprint_id,
                fingerprintHash: parsed.fingerprint_hash,
                userId: parsed.user_id,
                sessionId: parsed.session_id,
                location: parsed.geo_country ? {
                  country: parsed.geo_country,
                  countryCode: parsed.geo_country_code,
                  city: parsed.geo_city,
                  latitude: parsed.geo_latitude,
                  longitude: parsed.geo_longitude,
                  timezone: parsed.geo_timezone
                } : null,
                deviceType: parsed.device_type,
                userAgent: parsed.user_agent,
                vpnDetected: parsed.vpn_detected === true,
                eventType: parsed.event_type
              });
            } catch (_err) {
              logger.warn('Failed to parse fingerprint history log');
            }
          }
        }
      }

      // Sort by timestamp (most recent first)
      history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      logger.info('Fetched fingerprint history', { userId, count: history.length.toString() });
      return history;
    } catch (error) {
      logger.error('Failed to fetch fingerprint history', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return [];
    }
  }

  /**
   * Get last known location for a user.
   * Used for impossible travel detection in risk scoring.
   */
  async getLastKnownLocation(
    userId: string
  ): Promise<{ country: string; city: string | null; timestamp: string; latitude: number | null; longitude: number | null } | null> {
    try {
      const history = await this.getRecentHistory(userId, 1, 24); // Last 24 hours

      if (history.length === 0 || !history[0].location) {
        return null;
      }

      const last = history[0];
      return {
        country: last.location!.country,
        city: last.location!.city,
        timestamp: last.timestamp,
        latitude: last.location!.latitude,
        longitude: last.location!.longitude
      };
    } catch (error) {
      logger.error('Failed to get last known location', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return null;
    }
  }

  /**
   * Analyze location changes for a user (stub).
   */
  async analyzeLocationChanges(userId: string, _timeRangeHours: number = 168): Promise<LocationChange[]> {
    logger.debug('analyzeLocationChanges called', { userId });
    return [];
  }

  /**
   * Detect fingerprint changes for a user (stub).
   */
  async detectFingerprintChanges(userId: string, _timeRangeHours: number = 168): Promise<FingerprintChange[]> {
    logger.debug('detectFingerprintChanges called', { userId });
    return [];
  }

  /**
   * Get user activity summary (stub).
   */
  async getUserActivitySummary(userId: string, _timeRangeHours: number = 168): Promise<UserActivitySummary | null> {
    logger.debug('getUserActivitySummary called', { userId });
    return null;
  }
}
