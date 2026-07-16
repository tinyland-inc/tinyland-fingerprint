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
 * Uses the package-owned fingerprint record service as the data source for
 * historical queries and derived security analysis.
 * All external dependencies are injected via the config module.
 *
 * @module services/FingerprintHistoryService
 */

import { getScopedLogger } from '../config.js';
import {
  FingerprintDataService,
  type FingerprintRecord,
  type FingerprintUserSelector
} from './FingerprintDataService.js';

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

export type FingerprintHistorySelector = string | FingerprintUserSelector;

export interface FingerprintSecuritySignal {
  id: string;
  severity: 'warning' | 'error';
  kind: 'impossible_travel' | 'fingerprint_churn' | 'vpn_prevalence';
  title: string;
  message: string;
  count?: number;
}

export interface FingerprintInvestigationWindow {
  recentHistoryLimit?: number;
  recentHistoryHours?: number;
  extendedHistoryLimit?: number;
  extendedHistoryHours?: number;
}

export interface FingerprintSecurityInvestigation {
  sourceModel: 'derived_enrichment_history';
  signals: FingerprintSecuritySignal[];
  recentHistory: FingerprintHistory[];
  extendedHistory: FingerprintHistory[];
  locationChanges: LocationChange[];
  fingerprintChanges: FingerprintChange[];
  activitySummary: UserActivitySummary | null;
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
 * Query and analyze fingerprint history from the shared fingerprint record surface.
 */
export class FingerprintHistoryService {
  // CARE ITEM (TIN-1744, 2/5): ported as-is from vendored 0.3.0. 0.2.3
  // (standalone) had a no-arg constructor and computed its own `lokiUrl`
  // directly from config; this now takes a default-parameterized
  // FingerprintDataService, so `new FingerprintHistoryService()` still
  // compiles, but data authority is delegated to the data-plane service
  // (Tempo-primary, per FINGERPRINT_DATA_PLANE_CONTRACT) instead of the
  // class owning its own Loki client. See getRecentHistory() below for the
  // concrete data-source change this enables.
  constructor(private readonly dataService: FingerprintDataService = new FingerprintDataService()) {}

  private toTimeRange(timeRangeHours: number): string {
    const hours = Math.max(1, Math.floor(timeRangeHours));
    return `${hours}h`;
  }

  private getFetchLimit(limit: number): number {
    return Math.min(Math.max(limit * 10, 200), 1000);
  }

  private normalizeSelector(selector: FingerprintHistorySelector): FingerprintUserSelector {
    if (typeof selector === 'string') {
      return { userId: selector, userHandle: selector };
    }
    return selector;
  }

  private toHistory(record: FingerprintRecord): FingerprintHistory {
    return {
      timestamp: record.timestamp,
      fingerprintId: record.fingerprintId,
      fingerprintHash: record.fingerprintHash,
      userId: record.userId ?? record.userHandle ?? 'unknown',
      sessionId: record.sessionId ?? 'unknown',
      location: record.geoCountry ? {
        country: record.geoCountry,
        countryCode: (record.geoCountry || '').slice(0, 2).toUpperCase(),
        city: record.geoCity ?? null,
        latitude: record.geoLatitude ?? null,
        longitude: record.geoLongitude ?? null,
        timezone: null
      } : null,
      deviceType: record.deviceType ?? 'unknown',
      userAgent: record.userAgent ?? 'unknown',
      vpnDetected: record.vpnDetected,
      eventType: record.eventType
    };
  }

  private getLocationSignature(location: FingerprintHistory['location']): string {
    if (!location) return 'none';
    return [
      location.country,
      location.city ?? '',
      location.latitude ?? '',
      location.longitude ?? ''
    ].join('|');
  }

  private getLocationChangeReason(previous: FingerprintHistory, current: FingerprintHistory): string {
    if (!previous.location || !current.location) {
      return '';
    }

    if (previous.location.country !== current.location.country) {
      return `Country changed from ${previous.location.country} to ${current.location.country}`;
    }

    if (previous.location.city !== current.location.city) {
      return `City changed from ${previous.location.city ?? 'unknown'} to ${current.location.city ?? 'unknown'}`;
    }

    return '';
  }

  private getChangeDetails(previous: FingerprintHistory, current: FingerprintHistory): FingerprintChange | null {
    if (previous.vpnDetected !== current.vpnDetected) {
      return {
        timestamp: current.timestamp,
        changeType: 'vpn_toggle',
        oldFingerprint: previous.fingerprintHash,
        newFingerprint: current.fingerprintHash,
        details: `VPN detection changed from ${previous.vpnDetected ? 'enabled' : 'disabled'} to ${current.vpnDetected ? 'enabled' : 'disabled'}`
      };
    }

    if (previous.deviceType !== current.deviceType) {
      return {
        timestamp: current.timestamp,
        changeType: 'new_device',
        oldFingerprint: previous.fingerprintHash,
        newFingerprint: current.fingerprintHash,
        details: `Device type changed from ${previous.deviceType} to ${current.deviceType}`
      };
    }

    if (previous.userAgent !== current.userAgent) {
      return {
        timestamp: current.timestamp,
        changeType: 'browser_update',
        oldFingerprint: previous.fingerprintHash,
        newFingerprint: current.fingerprintHash,
        details: 'Browser context changed between visits'
      };
    }

    if (previous.fingerprintHash !== current.fingerprintHash) {
      return {
        timestamp: current.timestamp,
        changeType: 'fingerprint_change',
        oldFingerprint: previous.fingerprintHash,
        newFingerprint: current.fingerprintHash,
        details: 'Fingerprint hash changed between visits'
      };
    }

    return null;
  }

  /**
   * Get recent fingerprint history for a user.
   */
  // CARE ITEM (TIN-1744, 2/5): ported as-is from vendored 0.3.0. 0.2.3
  // (standalone) implemented this with a raw `fetch()` directly against Loki
  // using a hand-built LogQL query and `this.lokiUrl`. This now delegates
  // entirely to FingerprintDataService.getTempoFingerprintRecordsForUser(),
  // i.e. data-source authority moved from "Loki, always" to "Tempo primary,
  // Loki fallback, file fallback in dev". Return type is unchanged but query
  // semantics, ordering, and failure modes all differ. Flagged for operator
  // review — this is a real data-authority change, not a pure addition.
  async getRecentHistory(
    selector: FingerprintHistorySelector,
    limit: number = 10,
    timeRangeHours: number = 168 // 7 days
  ): Promise<FingerprintHistory[]> {
    try {
      const userSelector = this.normalizeSelector(selector);
      const records = await this.dataService.getTempoFingerprintRecordsForUser(
        userSelector,
        this.toTimeRange(timeRangeHours),
        this.getFetchLimit(limit)
      );
      const history = records
        .map((record) => this.toHistory(record))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      logger.info('Fetched fingerprint history', {
        userId: userSelector.userId,
        userHandle: userSelector.userHandle,
        count: history.length.toString(),
        source: 'tempo-user-history'
      });
      return history;
    } catch (error) {
      logger.error('Failed to fetch fingerprint history', {
        error: error instanceof Error ? error.message : String(error),
        userId: typeof selector === 'string' ? selector : selector.userId,
        userHandle: typeof selector === 'string' ? selector : selector.userHandle
      });
      return [];
    }
  }

  /**
   * Get last known location for a user.
   * Used for impossible travel detection in risk scoring.
   */
  async getLastKnownLocation(
    selector: FingerprintHistorySelector
  ): Promise<{ country: string; city: string | null; timestamp: string; latitude: number | null; longitude: number | null } | null> {
    try {
      const history = await this.getRecentHistory(selector, 1, 24); // Last 24 hours

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
        userId: typeof selector === 'string' ? selector : selector.userId,
        userHandle: typeof selector === 'string' ? selector : selector.userHandle
      });
      return null;
    }
  }

  /**
   * Analyze location changes for a user.
   */
  // CARE ITEM (TIN-1744, 2/5): ported as-is from vendored 0.3.0. 0.2.3
  // (standalone) body was an unconditional stub (`logger.debug(...); return
  // []`). This now does real Haversine-based impossible-travel detection
  // across the full location history. Same exported signature, materially
  // different runtime output — any consumer that depended on (or merely
  // tolerated) the old always-empty-array behavior will now see real,
  // populated results. Flagged for operator review.
  async analyzeLocationChanges(selector: FingerprintHistorySelector, timeRangeHours: number = 168): Promise<LocationChange[]> {
    const history = await this.getRecentHistory(selector, 1000, timeRangeHours);
    return this.analyzeLocationChangesFromHistory(history);
  }

  private analyzeLocationChangesFromHistory(history: FingerprintHistory[]): LocationChange[] {
    const chronological = history
      .filter((entry) => entry.location)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const changes: LocationChange[] = [];

    for (let i = 1; i < chronological.length; i++) {
      const previous = chronological[i - 1];
      const current = chronological[i];

      if (this.getLocationSignature(previous.location) === this.getLocationSignature(current.location)) {
        continue;
      }

      const timeElapsedMs = Math.max(
        0,
        new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()
      );

      const hasCoordinates =
        previous.location?.latitude != null &&
        previous.location?.longitude != null &&
        current.location?.latitude != null &&
        current.location?.longitude != null;

      const distanceKm = hasCoordinates
        ? calculateDistance(
            previous.location!.latitude!,
            previous.location!.longitude!,
            current.location!.latitude!,
            current.location!.longitude!
          )
        : 0;

      const impossibleTravel = hasCoordinates
        ? isImpossibleTravel(distanceKm, timeElapsedMs)
        : { impossible: false, reason: this.getLocationChangeReason(previous, current) };

      changes.push({
        from: {
          country: previous.location!.country,
          city: previous.location!.city,
          latitude: previous.location!.latitude,
          longitude: previous.location!.longitude,
          timestamp: previous.timestamp
        },
        to: {
          country: current.location!.country,
          city: current.location!.city,
          latitude: current.location!.latitude,
          longitude: current.location!.longitude,
          timestamp: current.timestamp
        },
        distanceKm,
        timeElapsedMs,
        isImpossible: impossibleTravel.impossible,
        reason: impossibleTravel.reason || this.getLocationChangeReason(previous, current)
      });
    }

    return changes.reverse();
  }

  /**
   * Detect fingerprint changes for a user.
   */
  // CARE ITEM (TIN-1744, 2/5): ported as-is from vendored 0.3.0. Same
  // stub-to-real pattern as analyzeLocationChanges() above: 0.2.3
  // (standalone) was an unconditional `return []` stub; this now does real
  // chronological churn detection (new_device / browser_update / vpn_toggle
  // / fingerprint_change). Flagged for operator review.
  async detectFingerprintChanges(selector: FingerprintHistorySelector, timeRangeHours: number = 168): Promise<FingerprintChange[]> {
    const history = await this.getRecentHistory(selector, 1000, timeRangeHours);
    return this.detectFingerprintChangesFromHistory(history);
  }

  private detectFingerprintChangesFromHistory(history: FingerprintHistory[]): FingerprintChange[] {
    const chronological = [...history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const changes: FingerprintChange[] = [];

    for (let i = 1; i < chronological.length; i++) {
      const change = this.getChangeDetails(chronological[i - 1], chronological[i]);
      if (change) {
        changes.push(change);
      }
    }

    return changes.reverse();
  }

  /**
   * Get user activity summary.
   */
  // CARE ITEM (TIN-1744, 2/5): ported as-is from vendored 0.3.0. Same
  // stub-to-real pattern as above: 0.2.3 (standalone) was an unconditional
  // `return null` stub; this now computes uniqueDevices / uniqueLocations /
  // uniqueFingerprints / vpnPercentage / impossibleTravelIncidents /
  // suspiciousActivityScore. Flagged for operator review.
  async getUserActivitySummary(selector: FingerprintHistorySelector, timeRangeHours: number = 168): Promise<UserActivitySummary | null> {
    const history = await this.getRecentHistory(selector, 1000, timeRangeHours);
    return this.getUserActivitySummaryFromHistory(history);
  }

  private getUserActivitySummaryFromHistory(history: FingerprintHistory[]): UserActivitySummary | null {
    if (history.length === 0) {
      return null;
    }

    const locationChanges = this.analyzeLocationChangesFromHistory(history);
    const fingerprintChanges = this.detectFingerprintChangesFromHistory(history);

    const uniqueDevices = new Set(history.map((entry) => `${entry.deviceType}|${entry.userAgent}`)).size;
    const uniqueLocations = new Set(
      history
        .filter((entry) => entry.location)
        .map((entry) => this.getLocationSignature(entry.location))
    ).size;
    const uniqueFingerprints = new Set(history.map((entry) => entry.fingerprintHash)).size;
    const vpnCount = history.filter((entry) => entry.vpnDetected).length;
    const impossibleTravelIncidents = locationChanges.filter((entry) => entry.isImpossible).length;

    const suspiciousActivityScore = Math.min(
      100,
      impossibleTravelIncidents * 40 +
        fingerprintChanges.length * 15 +
        (vpnCount / history.length >= 0.5 ? 20 : vpnCount / history.length >= 0.2 ? 10 : 0) +
        (uniqueLocations > 3 ? 10 : 0) +
        (uniqueDevices > 3 ? 10 : 0)
    );

    return {
      totalEvents: history.length,
      uniqueDevices,
      uniqueLocations,
      uniqueFingerprints,
      vpnPercentage: Math.round((vpnCount / history.length) * 100),
      impossibleTravelIncidents,
      fingerprintChanges: fingerprintChanges.length,
      suspiciousActivityScore
    };
  }

  deriveSecuritySignals(
    activitySummary: UserActivitySummary | null,
    locationChanges: LocationChange[],
    fingerprintChanges: FingerprintChange[]
  ): FingerprintSecuritySignal[] {
    if (!activitySummary) {
      return [];
    }

    const signals: FingerprintSecuritySignal[] = [];
    const impossibleTravelIncidents = locationChanges.filter((entry) => entry.isImpossible).length;

    if (impossibleTravelIncidents > 0) {
      signals.push({
        id: 'impossible-travel',
        severity: 'error',
        kind: 'impossible_travel',
        title: 'Impossible travel detected',
        message: `${impossibleTravelIncidents} impossible travel incident${impossibleTravelIncidents > 1 ? 's' : ''} detected in the investigation window.`,
        count: impossibleTravelIncidents
      });
    }

    if (fingerprintChanges.length > 5) {
      signals.push({
        id: 'fingerprint-churn',
        severity: 'warning',
        kind: 'fingerprint_churn',
        title: 'High fingerprint churn',
        message: `High number of fingerprint changes detected (${fingerprintChanges.length}) in the investigation window.`,
        count: fingerprintChanges.length
      });
    }

    if (activitySummary.vpnPercentage >= 80 && activitySummary.totalEvents >= 3) {
      signals.push({
        id: 'vpn-prevalence',
        severity: 'warning',
        kind: 'vpn_prevalence',
        title: 'VPN-heavy activity',
        message: `${activitySummary.vpnPercentage}% of recent events were VPN-attributed.`,
        count: activitySummary.vpnPercentage
      });
    }

    return signals;
  }

  async getSecurityInvestigation(
    selector: FingerprintHistorySelector,
    options: FingerprintInvestigationWindow = {}
  ): Promise<FingerprintSecurityInvestigation> {
    const recentHistoryLimit = options.recentHistoryLimit ?? 50;
    const recentHistoryHours = options.recentHistoryHours ?? 168;
    const extendedHistoryLimit = options.extendedHistoryLimit ?? 100;
    const extendedHistoryHours = options.extendedHistoryHours ?? 720;

    const [analysisHistory, extendedHistory] = await Promise.all([
      this.getRecentHistory(selector, Math.max(recentHistoryLimit, 1000), recentHistoryHours),
      this.getRecentHistory(selector, extendedHistoryLimit, extendedHistoryHours)
    ]);
    const recentHistory = analysisHistory.slice(0, recentHistoryLimit);
    const locationChanges = this.analyzeLocationChangesFromHistory(analysisHistory);
    const fingerprintChanges = this.detectFingerprintChangesFromHistory(analysisHistory);
    const activitySummary = this.getUserActivitySummaryFromHistory(analysisHistory);

    return {
      sourceModel: 'derived_enrichment_history',
      signals: this.deriveSecuritySignals(activitySummary, locationChanges, fingerprintChanges),
      recentHistory,
      extendedHistory,
      locationChanges,
      fingerprintChanges,
      activitySummary
    };
  }
}
