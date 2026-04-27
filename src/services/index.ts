





export {
  ensureClientFingerprintReady,
  type EnsureClientFingerprintReadyOptions,
  type EnsureClientFingerprintReadyResult,
} from './FingerprintClientIdentityService.js';

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
  type FingerprintAdditionalAttributes,
  type FingerprintEnrichmentOptions,
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
} from './FingerprintOverlayRuntimeService.js';

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
