/**
 * Core fingerprint type definitions.
 *
 * Extracted from the monorepo to break the fingerprint <-> security circular
 * dependency. All security-related types (RiskScore) are defined locally
 * to avoid requiring the security package at the type level.
 *
 * @module types/fingerprint
 */

import type { RiskScoreResult } from '../config.js';

/**
 * Device type classification from user agent analysis.
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/**
 * Enriched fingerprint data structure.
 * All data ready for structured logging to Loki.
 */
export interface EnrichedFingerprint {
  // Core fingerprint
  fingerprintId: string; // Raw FingerprintJS visitor ID
  fingerprintHash: string; // SHA-256 hash of fingerprint for storage
  timestamp: string; // ISO 8601 timestamp

  // Session context
  sessionId: string | null;
  userId: string | null;
  userHandle: string | null;
  userRole: string | null;

  // IP context (triple storage for balanced privacy/debugging)
  clientIp: string; // Raw IP - 7-day retention for emergency debugging
  clientIpEncrypted: string; // AES-256-GCM encrypted - 90-day retention for security investigations
  clientIpMasked: string; // HMAC-SHA256 hashed - permanent retention (cannot reverse)

  // GeoIP data (MaxMind)
  geoLocation: {
    country: string;
    countryCode: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
    accuracyRadius: number | null;
    source?: 'browser-geolocation' | 'maxmind-geoip' | 'mock-development';
  } | null;

  // VPN detection (MaxMind GeoLite2-ASN based, ~90%+ accuracy)
  vpnDetection: {
    isVPN: boolean;
    provider: string | null; // Known VPN provider (e.g., NordVPN, ProtonVPN, Mullvad)
    confidence: 'low' | 'medium' | 'high';
    method: 'asn' | 'datacenter' | 'unknown'; // asn = ASN database lookup
    details?: string;
  };

  // Browser context
  userAgent: string; // Full User-Agent string
  deviceType: DeviceType; // mobile, tablet, desktop, unknown

  // Navigation context (referrer tracking)
  navigation: {
    referrer: string | null; // HTTP Referer header - where they came from
    currentUrl: string; // Full current URL
    pathname: string; // Current pathname
    hostname: string; // Current hostname
  };

  // Browser fingerprint components (from FingerprintJS)
  components: {
    canvas?: string; // Canvas fingerprint
    webgl?: string; // WebGL fingerprint
    audio?: string; // Audio context fingerprint
    fonts?: string[]; // Detected fonts
    plugins?: string[]; // Browser plugins
    screenResolution?: string; // Screen resolution
    timezone?: string; // Browser timezone
    language?: string; // Browser language
    platform?: string; // OS platform
    cookiesEnabled?: boolean;
    localStorage?: boolean;
  };

  // Cookie/Session tracking
  cookies: {
    sessionCookiePresent: boolean;
    fingerprintCookiePresent: boolean;
    // Don't log actual cookie values - privacy concern
  };

  // User flags and stats (if authenticated)
  userFlags?: {
    totpEnabled: boolean;
    isActive: boolean;
    lastLogin: string | null;
    loginCount: number;
    failedLoginAttempts: number;
  };

  // Event metadata
  eventType:
    | 'session_created'
    | 'session_validated'
    | 'fingerprint_mismatch'
    | 'fingerprint_stored'
    | 'consent_submission';
  severity: 'info' | 'warning' | 'critical';

  // Risk scoring (calculated from all factors)
  riskScore?: RiskScoreResult;
}
