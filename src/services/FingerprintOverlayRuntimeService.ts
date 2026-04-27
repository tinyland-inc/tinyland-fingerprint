import {
  getDefaultSettings,
  restoreFullSettings,
  type FingerprintSettings,
} from './FingerprintSettingsService.js';
import {
  enrichFingerprint,
  type FingerprintRequestContext,
} from './FingerprintEnrichmentService.js';
import { getFingerprintConfig } from '../config.js';

export const DEFAULT_TEMPO_RETRY_AFTER_MS = 3000;
export const DEFAULT_OVERLAY_BATCH_INTERVAL_MS = 5000;
export const DEFAULT_OVERLAY_FALLBACK_KEY_PREFIX = 'tempo:';
export const DEFAULT_OVERLAY_HISTORY_ENDPOINT = '/api/settings/history';
export const DEFAULT_OVERLAY_SYNC_ENDPOINT = '/api/settings/sync';

const TEMPO_UNAVAILABLE_MARKERS = [
  'ECONNREFUSED',
  'timeout',
  'ETIMEDOUT',
  'ENOTFOUND',
];

export interface FingerprintOverlayServerState {
  fingerprintSettings: FingerprintSettings;
  isReturningVisitor: boolean;
  lastVisit: string | null;
  tempoAvailable: boolean;
  tempoRetryAfter: number | null;
  usedDefaults: boolean;
  errorMessage: string | null;
}

export type FingerprintSettingsHistoryKey =
  | 'preferences.theme'
  | 'preferences.darkMode';

export interface FingerprintSettingsHistoryOptions {
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export interface FingerprintSettingsHistoryEntry {
  value: unknown;
  timestamp: string;
}

export type FingerprintOverlayChangeSource = 'user' | 'system' | 'restored';

export interface FingerprintOverlayChange<
  K extends string = string,
  V = unknown,
> {
  key: K;
  value: V;
  timestamp: string;
  source: FingerprintOverlayChangeSource;
}

export interface FingerprintOverlayFallbackEntry<T = unknown> {
  value: T;
  timestamp: string;
  fingerprintId: string | null;
}

export interface FingerprintOverlayStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FingerprintOverlaySyncRequest<K extends string = string> {
  fingerprintId: string;
  changes: FingerprintOverlayChange<K>[];
}

export interface FingerprintOverlaySyncResponse {
  success: boolean;
  syncedCount: number;
  timestamp: string;
  error?: string;
}

export interface SyncFingerprintOverlayChangesOptions<
  K extends string = string,
> {
  ctx: FingerprintRequestContext;
  fingerprintId: string;
  changes: FingerprintOverlayChange<K>[];
  now?: () => string;
}

export type FingerprintOverlaySyncAttributeValue =
  | string
  | boolean
  | number;

export type FingerprintOverlaySyncAttributes = Record<
  string,
  FingerprintOverlaySyncAttributeValue
>;

export interface FingerprintOverlayFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
}

export type FingerprintOverlayFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FingerprintOverlayFetchResponse>;

export interface FingerprintOverlayJsonFetchResponse<T> {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<T>;
}

export type FingerprintOverlayJsonFetch<T> = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FingerprintOverlayJsonFetchResponse<T>>;

export interface FingerprintOverlaySyncRuntimeOptions<
  K extends string = string,
> {
  fingerprintId: () => string | null;
  syncEndpoint?: string;
  fetchImpl?: FingerprintOverlayFetch;
  storage?: FingerprintOverlayStorageAdapter | null;
  batchIntervalMs?: number;
  fallbackKeyPrefix?: string;
  now?: () => string;
  onPendingChangesChange?: (changes: FingerprintOverlayChange<K>[]) => void;
  onSyncingChange?: (isSyncing: boolean) => void;
  onTempoAvailabilityChange?: (isAvailable: boolean) => void;
  onLastSyncTimeChange?: (timestamp: string | null) => void;
}

export interface FingerprintOverlaySyncRuntime<K extends string = string> {
  recordChange: (
    key: K,
    value: unknown,
    source?: FingerprintOverlayChangeSource,
  ) => void;
  flush: () => Promise<boolean>;
  dispose: () => void;
  readFallback: <T = unknown>(key: K) => T | undefined;
  getPendingChanges: () => FingerprintOverlayChange<K>[];
}

export interface TempoRecoveryOptions {
  initialSettings?: FingerprintSettings | null;
  tempoAvailable: boolean;
  tempoRetryAfter?: number | null;
  maxRetries?: number;
  checkTempoHealth: () => Promise<boolean>;
  fetchSettings: () => Promise<FingerprintSettings | null | undefined>;
  onAttempt?: (attempt: number, maxRetries: number) => void;
}

export interface TempoRecoveryResult {
  fingerprintSettings?: FingerprintSettings | null;
  hasTempoSettings: boolean;
  recovered: boolean;
  attempts: number;
  timedOut: boolean;
}

export interface ResolveFingerprintOverlayClientStateOptions {
  initialSettings?: FingerprintSettings | null;
  serverNeedsConsent?: boolean;
  tempoAvailable: boolean;
  tempoRetryAfter?: number | null;
  maxRetries?: number;
  checkTempoHealth: () => Promise<boolean>;
  fetchSettings: () => Promise<FingerprintSettings | null | undefined>;
  onAttempt?: (attempt: number, maxRetries: number) => void;
}

export interface ResolvedFingerprintOverlayClientState {
  fingerprintSettings?: FingerprintSettings | null;
  hasTempoSettings: boolean;
  needsConsent: boolean;
  recovered: boolean;
  attempts: number;
  timedOut: boolean;
}

export interface FingerprintOverlayHydrationState {
  source: 'tempo' | 'defaults';
  hasTempoSettings: boolean;
  themeSettings: Pick<FingerprintSettings['preferences'], 'theme' | 'darkMode'> | null;
  overlaySettingsSnapshot: FingerprintOverlaySettingsSnapshot | null;
  restoredDetails: {
    visitCount: number;
    lastVisit: string | null;
    consentTimestamp: string | null;
  } | null;
}

export interface FingerprintOverlaySettingsSnapshot {
  settings: {
    'preferences.theme': string;
    'preferences.darkMode': 'light' | 'dark' | 'system';
    'a11y.reducedMotion': boolean;
    'a11y.highContrast': boolean;
    'a11y.fontSize': 'normal' | 'large' | 'x-large';
  };
  lastSyncTime: string | null;
}

export interface ApplyFingerprintOverlayHydrationStateOptions {
  hydrationState: FingerprintOverlayHydrationState;
  initializeThemeFromServerSettings: (
    settings: NonNullable<FingerprintOverlayHydrationState['themeSettings']>,
  ) => Promise<void>;
  initializeDefaults: () => Promise<void>;
  hydrateOverlaySettings: (
    snapshot: NonNullable<FingerprintOverlayHydrationState['overlaySettingsSnapshot']>,
  ) => void;
}

export interface AppliedFingerprintOverlayHydrationState {
  source: FingerprintOverlayHydrationState['source'];
  hasTempoSettings: boolean;
  hydratedOverlaySettings: boolean;
}

function getDefaultOverlayFetch(): FingerprintOverlayFetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fingerprint overlay sync requires a fetch implementation');
  }

  return async (input, init) => {
    const response = await globalThis.fetch(input, init);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  };
}

function getDefaultOverlayJsonFetch<T>(): FingerprintOverlayJsonFetch<T> {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fingerprint overlay history requires a fetch implementation');
  }

  return async (input, init) => {
    const response = await globalThis.fetch(input, init);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: () => response.json() as Promise<T>,
    };
  };
}

export function isTempoUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TEMPO_UNAVAILABLE_MARKERS.some((marker) => message.includes(marker));
}

export function hasTempoBackedSettings(
  settings?: FingerprintSettings | null,
): boolean {
  return !!settings?.consentTimestamp;
}

export function buildFingerprintOverlayFallbackKey(
  key: string,
  keyPrefix = DEFAULT_OVERLAY_FALLBACK_KEY_PREFIX,
): string {
  return `${keyPrefix}${key}`;
}

export function writeFingerprintOverlayFallback({
  key,
  value,
  fingerprintId,
  storage,
  timestamp = new Date().toISOString(),
  keyPrefix = DEFAULT_OVERLAY_FALLBACK_KEY_PREFIX,
}: {
  key: string;
  value: unknown;
  fingerprintId: string | null;
  storage?: FingerprintOverlayStorageAdapter | null;
  timestamp?: string;
  keyPrefix?: string;
}): void {
  if (!storage) {
    return;
  }

  const entry: FingerprintOverlayFallbackEntry = {
    value,
    timestamp,
    fingerprintId,
  };

  storage.setItem(
    buildFingerprintOverlayFallbackKey(key, keyPrefix),
    JSON.stringify(entry),
  );
}

export function readFingerprintOverlayFallback<T = unknown>({
  key,
  fingerprintId,
  storage,
  keyPrefix = DEFAULT_OVERLAY_FALLBACK_KEY_PREFIX,
}: {
  key: string;
  fingerprintId: string | null;
  storage?: FingerprintOverlayStorageAdapter | null;
  keyPrefix?: string;
}): T | undefined {
  if (!storage) {
    return undefined;
  }

  const raw = storage.getItem(buildFingerprintOverlayFallbackKey(key, keyPrefix));
  if (!raw) {
    return undefined;
  }

  try {
    const entry = JSON.parse(raw) as FingerprintOverlayFallbackEntry<T>;
    if (entry.fingerprintId !== fingerprintId) {
      return undefined;
    }

    return entry.value;
  } catch {
    return undefined;
  }
}

export function createFingerprintOverlaySyncRuntime<
  K extends string = string,
>(
  options: FingerprintOverlaySyncRuntimeOptions<K>,
): FingerprintOverlaySyncRuntime<K> {
  const {
    fingerprintId,
    syncEndpoint = DEFAULT_OVERLAY_SYNC_ENDPOINT,
    fetchImpl = getDefaultOverlayFetch(),
    storage = null,
    batchIntervalMs = DEFAULT_OVERLAY_BATCH_INTERVAL_MS,
    fallbackKeyPrefix = DEFAULT_OVERLAY_FALLBACK_KEY_PREFIX,
    now = () => new Date().toISOString(),
    onPendingChangesChange,
    onSyncingChange,
    onTempoAvailabilityChange,
    onLastSyncTimeChange,
  } = options;

  let pendingChanges: FingerprintOverlayChange<K>[] = [];
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  const emitPendingChanges = () => {
    onPendingChangesChange?.([...pendingChanges]);
  };

  const clearTimer = () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  };

  const flush = async (): Promise<boolean> => {
    clearTimer();

    const currentFingerprintId = fingerprintId();
    if (!currentFingerprintId || pendingChanges.length === 0) {
      return true;
    }

    onSyncingChange?.(true);

    try {
      const response = await fetchImpl(syncEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprintId: currentFingerprintId,
          changes: pendingChanges,
        } satisfies FingerprintOverlaySyncRequest<K>),
      });

      if (response.ok) {
        pendingChanges = [];
        emitPendingChanges();
        onLastSyncTimeChange?.(now());
        onTempoAvailabilityChange?.(true);
        return true;
      }

      onTempoAvailabilityChange?.(false);
      return false;
    } catch {
      onTempoAvailabilityChange?.(false);
      return false;
    } finally {
      onSyncingChange?.(false);
    }
  };

  const scheduleSync = () => {
    clearTimer();
    syncTimer = setTimeout(() => {
      void flush();
    }, batchIntervalMs);
  };

  return {
    recordChange: (key, value, source = 'user') => {
      const timestamp = now();

      pendingChanges = [
        ...pendingChanges,
        {
          key,
          value,
          timestamp,
          source,
        },
      ];

      emitPendingChanges();
      writeFingerprintOverlayFallback({
        key,
        value,
        fingerprintId: fingerprintId(),
        storage,
        timestamp,
        keyPrefix: fallbackKeyPrefix,
      });
      scheduleSync();
    },
    flush,
    dispose: clearTimer,
    readFallback: (key) =>
      readFingerprintOverlayFallback({
        key,
        fingerprintId: fingerprintId(),
        storage,
        keyPrefix: fallbackKeyPrefix,
      }),
    getPendingChanges: () => [...pendingChanges],
  };
}

export function buildFingerprintOverlaySyncAttributes<
  K extends string = string,
>(
  changes: FingerprintOverlayChange<K>[],
): FingerprintOverlaySyncAttributes {
  const attributes: FingerprintOverlaySyncAttributes = {};

  for (const change of changes) {
    if (!change.key || change.value === undefined) {
      continue;
    }

    const attrKey = `settings.${change.key}`;

    if (typeof change.value === 'boolean' || typeof change.value === 'number') {
      attributes[attrKey] = change.value;
    } else if (typeof change.value === 'object' && change.value !== null) {
      attributes[attrKey] = JSON.stringify(change.value);
    } else {
      attributes[attrKey] = String(change.value);
    }

    attributes[`${attrKey}.timestamp`] = change.timestamp;
  }

  return attributes;
}

export async function fetchFingerprintSettingsHistoryFromApi(
  fingerprintId: string,
  key: FingerprintSettingsHistoryKey,
  options: FingerprintSettingsHistoryOptions & {
    endpoint?: string;
    fetchImpl?: FingerprintOverlayJsonFetch<FingerprintSettingsHistoryEntry[]>;
  } = {},
): Promise<FingerprintSettingsHistoryEntry[]> {
  if (!fingerprintId) {
    return [];
  }

  const {
    endpoint = DEFAULT_OVERLAY_HISTORY_ENDPOINT,
    fetchImpl = getDefaultOverlayJsonFetch<FingerprintSettingsHistoryEntry[]>(),
    startTime,
    endTime,
    limit = 10,
  } = options;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fingerprintId,
      key,
      startTime,
      endTime,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function resolveFingerprintOverlayClientState(
  options: ResolveFingerprintOverlayClientStateOptions,
): Promise<ResolvedFingerprintOverlayClientState> {
  const {
    initialSettings = null,
    serverNeedsConsent = false,
    tempoAvailable,
    tempoRetryAfter,
    maxRetries = 10,
    checkTempoHealth,
    fetchSettings,
    onAttempt,
  } = options;

  let fingerprintSettings = initialSettings;
  let hasTempoSettings = hasTempoBackedSettings(fingerprintSettings);

  if (!tempoAvailable && !hasTempoSettings) {
    const recovery = await recoverFingerprintSettingsFromTempo({
      initialSettings: fingerprintSettings,
      tempoAvailable,
      tempoRetryAfter,
      maxRetries,
      checkTempoHealth,
      fetchSettings,
      onAttempt,
    });

    return {
      fingerprintSettings: recovery.fingerprintSettings,
      hasTempoSettings: recovery.hasTempoSettings,
      needsConsent: serverNeedsConsent && !recovery.hasTempoSettings,
      recovered: recovery.recovered,
      attempts: recovery.attempts,
      timedOut: recovery.timedOut,
    };
  }

  return {
    fingerprintSettings,
    hasTempoSettings,
    needsConsent: serverNeedsConsent && !hasTempoSettings,
    recovered: false,
    attempts: 0,
    timedOut: false,
  };
}

export function deriveFingerprintOverlayHydrationState(
  fingerprintSettings?: FingerprintSettings | null,
): FingerprintOverlayHydrationState {
  const hasTempoSettings = hasTempoBackedSettings(fingerprintSettings);

  if (!hasTempoSettings || !fingerprintSettings) {
    return {
      source: 'defaults',
      hasTempoSettings: false,
      themeSettings: null,
      overlaySettingsSnapshot: null,
      restoredDetails: null,
    };
  }

  return {
    source: 'tempo',
    hasTempoSettings: true,
    themeSettings: {
      theme: fingerprintSettings.preferences.theme,
      darkMode: fingerprintSettings.preferences.darkMode,
    },
    overlaySettingsSnapshot: {
      settings: {
        'preferences.theme': fingerprintSettings.preferences.theme,
        'preferences.darkMode': fingerprintSettings.preferences.darkMode,
        'a11y.reducedMotion': fingerprintSettings.a11y.reducedMotion,
        'a11y.highContrast': fingerprintSettings.a11y.highContrast,
        'a11y.fontSize': fingerprintSettings.a11y.fontSize,
      },
      lastSyncTime: fingerprintSettings.consentTimestamp ?? null,
    },
    restoredDetails: {
      visitCount: fingerprintSettings.visitCount,
      lastVisit: fingerprintSettings.lastVisit,
      consentTimestamp: fingerprintSettings.consentTimestamp ?? null,
    },
  };
}

export async function applyFingerprintOverlayHydrationState(
  options: ApplyFingerprintOverlayHydrationStateOptions,
): Promise<AppliedFingerprintOverlayHydrationState> {
  const {
    hydrationState,
    initializeThemeFromServerSettings,
    initializeDefaults,
    hydrateOverlaySettings,
  } = options;

  if (
    hydrationState.source === 'tempo' &&
    hydrationState.themeSettings &&
    hydrationState.overlaySettingsSnapshot
  ) {
    await initializeThemeFromServerSettings(hydrationState.themeSettings);
    hydrateOverlaySettings(hydrationState.overlaySettingsSnapshot);

    return {
      source: hydrationState.source,
      hasTempoSettings: hydrationState.hasTempoSettings,
      hydratedOverlaySettings: true,
    };
  }

  await initializeDefaults();

  return {
    source: hydrationState.source,
    hasTempoSettings: hydrationState.hasTempoSettings,
    hydratedOverlaySettings: false,
  };
}

export async function syncFingerprintOverlayChanges<
  K extends string = string,
>({
  ctx,
  fingerprintId,
  changes,
  now = () => new Date().toISOString(),
}: SyncFingerprintOverlayChangesOptions<K>): Promise<FingerprintOverlaySyncResponse> {
  await enrichFingerprint(
    ctx,
    fingerprintId,
    undefined,
    'session_validated',
    undefined,
    {
      additionalAttributes: buildFingerprintOverlaySyncAttributes(changes),
    },
  );

  return {
    success: true,
    syncedCount: changes.length,
    timestamp: now(),
  };
}

export async function restoreFingerprintOverlayServerState(
  fingerprintId: string,
): Promise<FingerprintOverlayServerState> {
  try {
    const settings = await restoreFullSettings(fingerprintId);

    return {
      fingerprintSettings: settings,
      isReturningVisitor: settings.visitCount > 1,
      lastVisit: settings.lastVisit,
      tempoAvailable: true,
      tempoRetryAfter: null,
      usedDefaults: false,
      errorMessage: null,
    };
  } catch (error) {
    const tempoUnavailable = isTempoUnavailableError(error);

    return {
      fingerprintSettings: getDefaultSettings(),
      isReturningVisitor: false,
      lastVisit: null,
      tempoAvailable: !tempoUnavailable,
      tempoRetryAfter: tempoUnavailable ? DEFAULT_TEMPO_RETRY_AFTER_MS : null,
      usedDefaults: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getFingerprintSettingsHistory(
  fingerprintId: string,
  key: FingerprintSettingsHistoryKey,
  options: FingerprintSettingsHistoryOptions = {},
): Promise<FingerprintSettingsHistoryEntry[]> {
  const config = getFingerprintConfig();
  if (!config.tempoQueryService) {
    return [];
  }

  const { startTime, endTime, limit = 10 } = options;

  let timeRange = '168h';
  if (startTime || endTime) {
    const now = Date.now();
    const start = startTime ? new Date(startTime).getTime() : now - (7 * 24 * 60 * 60 * 1000);
    const end = endTime ? new Date(endTime).getTime() : now;
    const durationHours = Math.ceil((end - start) / (60 * 60 * 1000));
    timeRange = `${durationHours}h`;
  }

  const traces = await config.tempoQueryService.queryFingerprints(
    timeRange,
    { 'fingerprint.id': fingerprintId },
    limit * 2,
  );

  const history: FingerprintSettingsHistoryEntry[] = [];

  for (const trace of traces || []) {
    const value = extractSettingValue(trace as Record<string, unknown>, key);
    if (value !== undefined) {
      history.push({
        value,
        timestamp: String(trace.timestamp),
      });
    }
  }

  let filtered = history;
  if (startTime || endTime) {
    const startMs = startTime ? new Date(startTime).getTime() : 0;
    const endMs = endTime ? new Date(endTime).getTime() : Date.now();

    filtered = history.filter((entry) => {
      const entryTime = new Date(entry.timestamp).getTime();
      return entryTime >= startMs && entryTime <= endMs;
    });
  }

  filtered.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return filtered.slice(0, limit);
}

export async function recoverFingerprintSettingsFromTempo(
  options: TempoRecoveryOptions,
): Promise<TempoRecoveryResult> {
  const {
    initialSettings = null,
    tempoAvailable,
    tempoRetryAfter = DEFAULT_TEMPO_RETRY_AFTER_MS,
    maxRetries = 10,
    checkTempoHealth,
    fetchSettings,
    onAttempt,
  } = options;
  const retryDelay = tempoRetryAfter ?? DEFAULT_TEMPO_RETRY_AFTER_MS;

  if (tempoAvailable || hasTempoBackedSettings(initialSettings)) {
    return {
      fingerprintSettings: initialSettings,
      hasTempoSettings: hasTempoBackedSettings(initialSettings),
      recovered: false,
      attempts: 0,
      timedOut: false,
    };
  }

  let fingerprintSettings = initialSettings;
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts += 1;
    onAttempt?.(attempts, maxRetries);

    await new Promise((resolve) => setTimeout(resolve, retryDelay));

    try {
      const healthy = await checkTempoHealth();
      if (!healthy) continue;

      const restoredSettings = await fetchSettings();
      fingerprintSettings = restoredSettings ?? null;

      return {
        fingerprintSettings,
        hasTempoSettings: hasTempoBackedSettings(fingerprintSettings),
        recovered: true,
        attempts,
        timedOut: false,
      };
    } catch {
      continue;
    }
  }

  return {
    fingerprintSettings,
    hasTempoSettings: hasTempoBackedSettings(fingerprintSettings),
    recovered: false,
    attempts,
    timedOut: true,
  };
}

function extractSettingValue(
  trace: Record<string, unknown>,
  key: FingerprintSettingsHistoryKey,
): unknown {
  switch (key) {
    case 'preferences.theme':
      return trace.preferencesTheme;
    case 'preferences.darkMode':
      return trace.preferencesDarkMode;
  }
}
