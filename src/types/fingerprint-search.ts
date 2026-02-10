/**
 * Type definitions for fingerprint intelligence search system.
 *
 * These types align with the tRPC schemas in the monorepo.
 *
 * @module types/fingerprint-search
 */

/**
 * Search result record
 */
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

/**
 * Facet value with count
 */
export interface FacetValue {
  name: string;
  count: number;
}

/**
 * Country facet
 */
export interface CountryFacet extends FacetValue {
  code: string;
}

/**
 * City facet
 */
export interface CityFacet extends FacetValue {
  country: string;
}

/**
 * Browser facet
 */
export interface BrowserFacet extends FacetValue {
  version?: string;
}

/**
 * Device type facet
 */
export interface DeviceTypeFacet {
  type: 'mobile' | 'desktop' | 'tablet' | 'bot';
  count: number;
}

/**
 * Risk tier facet
 */
export interface RiskTierFacet {
  tier: 'low' | 'medium' | 'high' | 'critical';
  count: number;
}

/**
 * VPN provider facet
 */
export interface VPNProviderFacet {
  provider: string;
  count: number;
}

/**
 * Operating system facet
 */
export interface OSFacet {
  os: string;
  version: string;
  count: number;
}

/**
 * Search facets (available filter values)
 */
export interface SearchFacets {
  countries: CountryFacet[];
  cities: CityFacet[];
  browsers: BrowserFacet[];
  deviceTypes: DeviceTypeFacet[];
  riskTiers: RiskTierFacet[];
  vpnProviders: VPNProviderFacet[];
  operatingSystems: OSFacet[];
}

/**
 * Quick search result
 */
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
