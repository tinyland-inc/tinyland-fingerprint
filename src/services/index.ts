





export {
  FingerprintDataService,
  type FingerprintRecord,
} from './FingerprintDataService.js';

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
  type EnrichedFingerprint,
} from './FingerprintEnrichmentService.js';

export {
  FingerprintHistoryService,
  calculateDistance,
  isImpossibleTravel,
  type FingerprintHistory,
  type LocationChange,
  type FingerprintChange,
  type UserActivitySummary,
} from './FingerprintHistoryService.js';

export {
  FingerprintSearchService,
  type SearchFilters,
  type SearchServiceResult,
  type SearchResults,
  type ServiceSearchFacets,
  type ServiceQuickSearchResult,
  type ExportResult,
} from './FingerprintSearchService.js';

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
} from './FingerprintSettingsService.js';
