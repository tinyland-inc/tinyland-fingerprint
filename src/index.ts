/**
 * @tinyland-inc/tinyland-fingerprint
 *
 * Fingerprint intelligence services: enrichment, search, history,
 * settings, validation, and caching.
 *
 * @module tinyland-fingerprint
 */

// Configuration
export {
  configureFingerprint,
  getFingerprintConfig,
  resetFingerprintConfig,
  getScopedLogger,
  withSpan,
  withTracerSpan,
  noopSpan,
  DEFAULT_CONSENT,
  type FingerprintConfig,
  type FingerprintLogger,
  type FingerprintFileLogger,
  type FingerprintSpan,
  type FingerprintTracer,
  type GeoLocationResult,
  type VPNDetectionResult,
  type RiskScoreResult,
  type ObservabilityFetcher,
  type TempoQueryServiceInterface,
  type ChildSpanReaderInterface,
  type UserFlagsFetcher,
  type ReverseGeocodeFn,
  type ConsentCategories,
  type RestorableSettings,
  type ConsentRecord,
} from './config.js';

// Types
export type {
  DeviceType,
  EnrichedFingerprint,
} from './types/fingerprint.js';

export type {
  SearchResult,
  FacetValue,
  CountryFacet,
  CityFacet,
  BrowserFacet,
  DeviceTypeFacet,
  RiskTierFacet,
  VPNProviderFacet,
  OSFacet,
  SearchFacets,
  QuickSearchResult,
} from './types/fingerprint-search.js';

export type {
  MapMarker,
  HeatmapPoint,
  FingerprintGeoData,
} from './types/maps.js';

// Services
export {
  FingerprintDataService,
  type FingerprintRecord,
} from './services/FingerprintDataService.js';

export {
  enrichFingerprint,
  enrichFingerprintOnSessionCreate,
  enrichFingerprintOnValidation,
  enrichFingerprintOnMismatch,
  getEnrichmentServiceHealth,
  classifyDevice,
  maskIpAddress,
  parseUserAgent,
  type ConsentPreferenceData,
  type FingerprintRequestContext,
} from './services/FingerprintEnrichmentService.js';

export {
  FingerprintHistoryService,
  calculateDistance,
  isImpossibleTravel,
  type FingerprintHistory,
  type LocationChange,
  type FingerprintChange,
  type UserActivitySummary,
} from './services/FingerprintHistoryService.js';

export {
  FingerprintSearchService,
  type SearchFilters,
  type SearchServiceResult,
  type SearchResults,
  type ServiceSearchFacets,
  type ServiceQuickSearchResult,
  type ExportResult,
} from './services/FingerprintSearchService.js';

export {
  restoreFingerprintSettings,
  restoreFullSettings,
  getFingerprintVisitCount,
  getTimeSinceLastVisit,
  formatTimeSinceLastVisit,
  hasPreviousConsent,
  getVisitHistory,
  getDefaultSettings,
  type FingerprintSettings,
  type VisitSummary,
} from './services/FingerprintSettingsService.js';

// Middleware
export {
  storeFingerprint,
  validateFingerprint,
  clearFingerprint,
  getSessionFingerprint,
  cleanExpiredFingerprints,
} from './middleware/validation.js';

// Cache
export {
  wasRecentlyLogged,
  markAsLogged,
  getCacheStats,
  invalidateFingerprint,
  clearCache,
} from './cache.js';
