/**
 * Geographic mapping types (locally defined to avoid monorepo dependency).
 *
 * @module types/maps
 */

/**
 * Map marker representing a fingerprint location.
 */
export interface MapMarker {
  id: string;
  position: [number, number];
  country: string;
  city: string | null;
  isVPN: boolean;
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown' | 'bot';
  timestamp: string;
  userId?: string;
  sessionId?: string;
  userHandle?: string;
  ipHash?: string;
}

/**
 * Heatmap intensity point.
 */
export interface HeatmapPoint {
  position: [number, number];
  intensity: number;
}

/**
 * Aggregated fingerprint geographic data.
 */
export interface FingerprintGeoData {
  markers: MapMarker[];
  locationCounts: HeatmapPoint[];
  totalFingerprints: number;
  vpnPercentage: number;
  highRiskCount: number;
}
