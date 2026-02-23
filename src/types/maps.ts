








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




export interface HeatmapPoint {
  position: [number, number];
  intensity: number;
}




export interface FingerprintGeoData {
  markers: MapMarker[];
  locationCounts: HeatmapPoint[];
  totalFingerprints: number;
  vpnPercentage: number;
  highRiskCount: number;
}
