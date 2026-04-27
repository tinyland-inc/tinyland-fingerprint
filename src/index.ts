









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


export {
  ensureClientFingerprintReady,
  type EnsureClientFingerprintReadyOptions,
  type EnsureClientFingerprintReadyResult,
} from './services/FingerprintClientIdentityService.js';

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
  type FingerprintAdditionalAttributes,
  type FingerprintEnrichmentOptions,
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
  applyFingerprintOverlayHydrationState,
  restoreFingerprintOverlayServerState,
  getFingerprintSettingsHistory,
  recoverFingerprintSettingsFromTempo,
  deriveFingerprintOverlayHydrationState,
  hasTempoBackedSettings,
  isTempoUnavailableError,
  buildFingerprintOverlayFallbackKey,
  writeFingerprintOverlayFallback,
  readFingerprintOverlayFallback,
  createFingerprintOverlaySyncRuntime,
  buildFingerprintOverlaySyncAttributes,
  fetchFingerprintSettingsHistoryFromApi,
  resolveFingerprintOverlayClientState,
  syncFingerprintOverlayChanges,
  DEFAULT_TEMPO_RETRY_AFTER_MS,
  DEFAULT_OVERLAY_BATCH_INTERVAL_MS,
  DEFAULT_OVERLAY_FALLBACK_KEY_PREFIX,
  DEFAULT_OVERLAY_HISTORY_ENDPOINT,
  DEFAULT_OVERLAY_SYNC_ENDPOINT,
  type FingerprintOverlayServerState,
  type FingerprintOverlayChangeSource,
  type FingerprintOverlayChange,
  type FingerprintOverlayFallbackEntry,
  type FingerprintOverlayStorageAdapter,
  type FingerprintOverlaySyncRequest,
  type FingerprintOverlaySyncResponse,
  type SyncFingerprintOverlayChangesOptions,
  type FingerprintOverlaySyncAttributeValue,
  type FingerprintOverlaySyncAttributes,
  type FingerprintOverlayFetchResponse,
  type FingerprintOverlayFetch,
  type FingerprintOverlayJsonFetchResponse,
  type FingerprintOverlayJsonFetch,
  type FingerprintOverlaySyncRuntimeOptions,
  type FingerprintOverlaySyncRuntime,
  type FingerprintSettingsHistoryKey,
  type FingerprintSettingsHistoryOptions,
  type FingerprintSettingsHistoryEntry,
  type TempoRecoveryOptions,
  type TempoRecoveryResult,
  type FingerprintOverlayHydrationState,
  type FingerprintOverlaySettingsSnapshot,
  type ApplyFingerprintOverlayHydrationStateOptions,
  type AppliedFingerprintOverlayHydrationState,
  type ResolveFingerprintOverlayClientStateOptions,
  type ResolvedFingerprintOverlayClientState,
} from './services/FingerprintOverlayRuntimeService.js';

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


export {
  storeFingerprint,
  validateFingerprint,
  clearFingerprint,
  getSessionFingerprint,
  cleanExpiredFingerprints,
} from './middleware/validation.js';


export {
  wasRecentlyLogged,
  markAsLogged,
  getCacheStats,
  invalidateFingerprint,
  clearCache,
} from './cache.js';
