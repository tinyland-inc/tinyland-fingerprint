










export interface SearchResult {
  fingerprintId: string;
  firstSeen: string;
  lastSeen: string;
  vpnDetected: boolean;
  vpnProvider?: string;
  vpnConfidence?: number;
  riskScore?: number;
  riskTier?: 'low' | 'medium' | 'high' | 'critical';
  geoCountry?: string;
  geoCity?: string;
  geoLatitude?: number;
  geoLongitude?: number;
  geoTimezone?: string;
  browserName?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot';
  engine?: string;
  ipVersion?: '4' | '6';
  asn?: string;
  datacenterIp?: boolean;
  privateIp?: boolean;
  userId?: string;
  userHandle?: string;
  sessionId?: string;
  sessionActive?: boolean;
}




export interface FacetValue {
  name: string;
  count: number;
}




export interface CountryFacet extends FacetValue {
  code: string;
}




export interface CityFacet extends FacetValue {
  country: string;
}




export interface BrowserFacet extends FacetValue {
  version?: string;
}




export interface DeviceTypeFacet {
  type: 'mobile' | 'desktop' | 'tablet' | 'bot';
  count: number;
}




export interface RiskTierFacet {
  tier: 'low' | 'medium' | 'high' | 'critical';
  count: number;
}




export interface VPNProviderFacet {
  provider: string;
  count: number;
}




export interface OSFacet {
  os: string;
  version: string;
  count: number;
}




export interface SearchFacets {
  countries: CountryFacet[];
  cities: CityFacet[];
  browsers: BrowserFacet[];
  deviceTypes: DeviceTypeFacet[];
  riskTiers: RiskTierFacet[];
  vpnProviders: VPNProviderFacet[];
  operatingSystems: OSFacet[];
}




export interface QuickSearchResult {
  type: 'fingerprint' | 'user' | 'ip';
  id: string;
  label: string;
  metadata?: {
    country?: string;
    city?: string;
    lastSeen?: string;
    riskScore?: number;
  };
}
