import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFingerprintOverlayHydrationState,
  buildFingerprintOverlaySyncAttributes,
  createFingerprintOverlaySyncRuntime,
  DEFAULT_TEMPO_RETRY_AFTER_MS,
  DEFAULT_OVERLAY_BATCH_INTERVAL_MS,
  DEFAULT_OVERLAY_HISTORY_ENDPOINT,
  deriveFingerprintOverlayHydrationState,
  fetchFingerprintSettingsHistoryFromApi,
  getFingerprintSettingsHistory,
  hasTempoBackedSettings,
  isTempoUnavailableError,
  readFingerprintOverlayFallback,
  resolveFingerprintOverlayClientState,
  recoverFingerprintSettingsFromTempo,
  restoreFingerprintOverlayServerState,
  syncFingerprintOverlayChanges,
  writeFingerprintOverlayFallback,
} from '../src/services/FingerprintOverlayRuntimeService.js';
import { getDefaultSettings } from '../src/services/FingerprintSettingsService.js';
import { configureFingerprint, resetFingerprintConfig } from '../src/config.js';

describe('FingerprintOverlayRuntimeService', () => {
  beforeEach(() => {
    resetFingerprintConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTempoUnavailableError', () => {
    it('detects Tempo connectivity failures', () => {
      expect(isTempoUnavailableError(new Error('Tempo unavailable: ECONNREFUSED'))).toBe(true);
      expect(isTempoUnavailableError(new Error('request timeout'))).toBe(true);
      expect(isTempoUnavailableError(new Error('ENOTFOUND'))).toBe(true);
      expect(isTempoUnavailableError(new Error('boom'))).toBe(false);
    });
  });

  describe('restoreFingerprintOverlayServerState', () => {
    it('returns restored state when settings are available', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-01-15T10:00:00Z',
              preferencesTheme: 'pride',
              preferencesDarkMode: 'dark',
              geoCountry: 'United States',
              browserName: 'Firefox',
              browserVersion: '121.0',
              osName: 'Linux',
            },
            {
              timestamp: '2026-01-14T08:00:00Z',
            },
          ]),
          searchTraces: vi.fn().mockResolvedValue([]),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await restoreFingerprintOverlayServerState('fp-restored');

      expect(result.usedDefaults).toBe(false);
      expect(result.tempoAvailable).toBe(true);
      expect(result.tempoRetryAfter).toBeNull();
      expect(result.errorMessage).toBeNull();
      expect(result.isReturningVisitor).toBe(true);
      expect(result.lastVisit).toBe('2026-01-15T10:00:00Z');
      expect(result.fingerprintSettings.preferences.theme).toBe('pride');
      expect(result.fingerprintSettings.preferences.darkMode).toBe('dark');
    });

    it('preserves existing default-return semantics when tempo is not configured', async () => {
      const result = await restoreFingerprintOverlayServerState('fp-no-tempo');

      expect(result).toEqual({
        fingerprintSettings: getDefaultSettings(),
        isReturningVisitor: false,
        lastVisit: null,
        tempoAvailable: true,
        tempoRetryAfter: null,
        usedDefaults: false,
        errorMessage: null,
      });
    });

    it('surfaces tempo-unavailable state for client-side retry', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockRejectedValue(new Error('ECONNREFUSED: dial tcp 127.0.0.1:3200')),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await restoreFingerprintOverlayServerState('fp-tempo-down');

      expect(result.fingerprintSettings).toEqual(getDefaultSettings());
      expect(result.usedDefaults).toBe(true);
      expect(result.tempoAvailable).toBe(false);
      expect(result.tempoRetryAfter).toBe(DEFAULT_TEMPO_RETRY_AFTER_MS);
      expect(result.errorMessage).toContain('Tempo unavailable');
    });
  });

  describe('getFingerprintSettingsHistory', () => {
    it('returns empty history when tempo is not configured', async () => {
      const result = await getFingerprintSettingsHistory('fp-no-tempo', 'preferences.theme');
      expect(result).toEqual([]);
    });

    it('returns sorted limited history for supported settings keys', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-01-14T08:00:00Z',
              preferencesTheme: 'trans',
              preferencesDarkMode: 'system',
            },
            {
              timestamp: '2026-01-15T10:00:00Z',
              preferencesTheme: 'pride',
              preferencesDarkMode: 'dark',
            },
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await getFingerprintSettingsHistory(
        'fp-history',
        'preferences.theme',
        { limit: 1 },
      );

      expect(result).toEqual([
        {
          value: 'pride',
          timestamp: '2026-01-15T10:00:00Z',
        },
      ]);
    });

    it('applies start/end time filtering', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-01-13T08:00:00Z',
              preferencesDarkMode: 'light',
            },
            {
              timestamp: '2026-01-15T10:00:00Z',
              preferencesDarkMode: 'dark',
            },
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await getFingerprintSettingsHistory(
        'fp-history',
        'preferences.darkMode',
        {
          startTime: '2026-01-14T00:00:00Z',
          endTime: '2026-01-16T00:00:00Z',
        },
      );

      expect(result).toEqual([
        {
          value: 'dark',
          timestamp: '2026-01-15T10:00:00Z',
        },
      ]);
    });
  });

  describe('recoverFingerprintSettingsFromTempo', () => {
    it('short-circuits when tempo is already available', async () => {
      const settings = getDefaultSettings();
      settings.consentTimestamp = '2026-01-15T10:00:00Z';

      const checkTempoHealth = vi.fn();
      const fetchSettings = vi.fn();

      const result = await recoverFingerprintSettingsFromTempo({
        initialSettings: settings,
        tempoAvailable: true,
        checkTempoHealth,
        fetchSettings,
      });

      expect(result).toEqual({
        fingerprintSettings: settings,
        hasTempoSettings: true,
        recovered: false,
        attempts: 0,
        timedOut: false,
      });
      expect(checkTempoHealth).not.toHaveBeenCalled();
      expect(fetchSettings).not.toHaveBeenCalled();
    });

    it('recovers settings after tempo becomes healthy', async () => {
      const restored = getDefaultSettings();
      restored.consentTimestamp = '2026-01-15T10:00:00Z';

      const attemptSpy = vi.fn();
      const result = await recoverFingerprintSettingsFromTempo({
        initialSettings: null,
        tempoAvailable: false,
        tempoRetryAfter: 0,
        maxRetries: 3,
        onAttempt: attemptSpy,
        checkTempoHealth: vi.fn().mockResolvedValue(true),
        fetchSettings: vi.fn().mockResolvedValue(restored),
      });

      expect(attemptSpy).toHaveBeenCalledWith(1, 3);
      expect(result).toEqual({
        fingerprintSettings: restored,
        hasTempoSettings: true,
        recovered: true,
        attempts: 1,
        timedOut: false,
      });
    });

    it('times out after max retries when tempo never recovers', async () => {
      const result = await recoverFingerprintSettingsFromTempo({
        initialSettings: null,
        tempoAvailable: false,
        tempoRetryAfter: 0,
        maxRetries: 2,
        checkTempoHealth: vi.fn().mockResolvedValue(false),
        fetchSettings: vi.fn(),
      });

      expect(result).toEqual({
        fingerprintSettings: null,
        hasTempoSettings: false,
        recovered: false,
        attempts: 2,
        timedOut: true,
      });
    });
  });

  describe('overlay fallback cache', () => {
    it('writes and reads fallback values scoped to the fingerprint id', () => {
      const storage = new Map<string, string>();
      const adapter = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      };

      writeFingerprintOverlayFallback({
        key: 'preferences.theme',
        value: 'pride',
        fingerprintId: 'fp-123',
        storage: adapter,
        timestamp: '2026-01-15T10:00:00Z',
      });

      expect(
        readFingerprintOverlayFallback<string>({
          key: 'preferences.theme',
          fingerprintId: 'fp-123',
          storage: adapter,
        }),
      ).toBe('pride');

      expect(
        readFingerprintOverlayFallback<string>({
          key: 'preferences.theme',
          fingerprintId: 'fp-other',
          storage: adapter,
        }),
      ).toBeUndefined();
    });
  });

  describe('createFingerprintOverlaySyncRuntime', () => {
    it('batches queued changes and flushes them through the sync endpoint', async () => {
      vi.useFakeTimers();

      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const pendingSnapshots: number[] = [];
      const syncingSnapshots: boolean[] = [];
      const availabilitySnapshots: boolean[] = [];
      const syncTimes: Array<string | null> = [];

      const runtime = createFingerprintOverlaySyncRuntime({
        fingerprintId: () => 'fp-sync',
        syncEndpoint: '/api/settings/sync',
        batchIntervalMs: 25,
        fetchImpl,
        now: () => '2026-01-15T10:00:00Z',
        onPendingChangesChange: (changes) => {
          pendingSnapshots.push(changes.length);
        },
        onSyncingChange: (isSyncing) => {
          syncingSnapshots.push(isSyncing);
        },
        onTempoAvailabilityChange: (isAvailable) => {
          availabilitySnapshots.push(isAvailable);
        },
        onLastSyncTimeChange: (timestamp) => {
          syncTimes.push(timestamp);
        },
      });

      runtime.recordChange('preferences.theme', 'pride');
      runtime.recordChange('preferences.darkMode', 'dark');

      expect(runtime.getPendingChanges()).toHaveLength(2);
      expect(fetchImpl).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(25);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledWith('/api/settings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprintId: 'fp-sync',
          changes: [
            {
              key: 'preferences.theme',
              value: 'pride',
              timestamp: '2026-01-15T10:00:00Z',
              source: 'user',
            },
            {
              key: 'preferences.darkMode',
              value: 'dark',
              timestamp: '2026-01-15T10:00:00Z',
              source: 'user',
            },
          ],
        }),
      });
      expect(runtime.getPendingChanges()).toEqual([]);
      expect(pendingSnapshots).toEqual([1, 2, 0]);
      expect(syncingSnapshots).toEqual([true, false]);
      expect(availabilitySnapshots).toEqual([true]);
      expect(syncTimes).toEqual(['2026-01-15T10:00:00Z']);

      runtime.dispose();
    });

    it('marks tempo unavailable and preserves pending changes when sync fails', async () => {
      const runtime = createFingerprintOverlaySyncRuntime({
        fingerprintId: () => 'fp-sync',
        syncEndpoint: '/api/settings/sync',
        fetchImpl: vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        }),
        batchIntervalMs: DEFAULT_OVERLAY_BATCH_INTERVAL_MS,
      });

      runtime.recordChange('preferences.theme', 'pride');

      await expect(runtime.flush()).resolves.toBe(false);
      expect(runtime.getPendingChanges()).toHaveLength(1);
    });
  });

  describe('buildFingerprintOverlaySyncAttributes', () => {
    it('serializes valid overlay changes into settings.* attributes', () => {
      expect(
        buildFingerprintOverlaySyncAttributes([
          {
            key: 'preferences.theme',
            value: 'pride',
            timestamp: '2026-01-15T10:00:00Z',
            source: 'user',
          },
          {
            key: 'functional.circuitBreaker',
            value: { isOpen: true, failureCount: 3 },
            timestamp: '2026-01-15T10:00:01Z',
            source: 'system',
          },
          {
            key: '',
            value: 'ignored',
            timestamp: '2026-01-15T10:00:02Z',
            source: 'user',
          },
        ]),
      ).toEqual({
        'settings.preferences.theme': 'pride',
        'settings.preferences.theme.timestamp': '2026-01-15T10:00:00Z',
        'settings.functional.circuitBreaker': JSON.stringify({
          isOpen: true,
          failureCount: 3,
        }),
        'settings.functional.circuitBreaker.timestamp': '2026-01-15T10:00:01Z',
      });
    });
  });

  describe('fetchFingerprintSettingsHistoryFromApi', () => {
    it('fetches history through the default overlay history endpoint', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [
          {
            value: 'pride',
            timestamp: '2026-01-15T10:00:00Z',
          },
        ],
      });

      const result = await fetchFingerprintSettingsHistoryFromApi(
        'fp-history',
        'preferences.theme',
        {
          fetchImpl,
          startTime: '2026-01-14T00:00:00Z',
          endTime: '2026-01-16T00:00:00Z',
          limit: 5,
        },
      );

      expect(fetchImpl).toHaveBeenCalledWith(DEFAULT_OVERLAY_HISTORY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprintId: 'fp-history',
          key: 'preferences.theme',
          startTime: '2026-01-14T00:00:00Z',
          endTime: '2026-01-16T00:00:00Z',
          limit: 5,
        }),
      });
      expect(result).toEqual([
        {
          value: 'pride',
          timestamp: '2026-01-15T10:00:00Z',
        },
      ]);
    });

    it('returns empty history when fingerprint id is missing', async () => {
      const fetchImpl = vi.fn();
      await expect(
        fetchFingerprintSettingsHistoryFromApi('', 'preferences.theme', {
          fetchImpl,
        }),
      ).resolves.toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('resolveFingerprintOverlayClientState', () => {
    it('returns existing tempo-backed settings without polling when already available', async () => {
      const settings = getDefaultSettings();
      settings.consentTimestamp = '2026-01-15T10:00:00Z';

      const checkTempoHealth = vi.fn();
      const fetchSettings = vi.fn();

      const result = await resolveFingerprintOverlayClientState({
        initialSettings: settings,
        serverNeedsConsent: true,
        tempoAvailable: true,
        checkTempoHealth,
        fetchSettings,
      });

      expect(result).toEqual({
        fingerprintSettings: settings,
        hasTempoSettings: true,
        needsConsent: false,
        recovered: false,
        attempts: 0,
        timedOut: false,
      });
      expect(checkTempoHealth).not.toHaveBeenCalled();
      expect(fetchSettings).not.toHaveBeenCalled();
    });

    it('polls and returns recovered tempo-backed settings when server tempo was unavailable', async () => {
      const restored = getDefaultSettings();
      restored.consentTimestamp = '2026-01-15T10:00:00Z';

      const result = await resolveFingerprintOverlayClientState({
        initialSettings: null,
        serverNeedsConsent: true,
        tempoAvailable: false,
        tempoRetryAfter: 0,
        maxRetries: 2,
        checkTempoHealth: vi.fn().mockResolvedValue(true),
        fetchSettings: vi.fn().mockResolvedValue(restored),
      });

      expect(result).toEqual({
        fingerprintSettings: restored,
        hasTempoSettings: true,
        needsConsent: false,
        recovered: true,
        attempts: 1,
        timedOut: false,
      });
    });

    it('preserves consent requirement when no tempo-backed consent was recovered', async () => {
      const result = await resolveFingerprintOverlayClientState({
        initialSettings: null,
        serverNeedsConsent: true,
        tempoAvailable: true,
        checkTempoHealth: vi.fn(),
        fetchSettings: vi.fn(),
      });

      expect(result).toEqual({
        fingerprintSettings: null,
        hasTempoSettings: false,
        needsConsent: true,
        recovered: false,
        attempts: 0,
        timedOut: false,
      });
    });
  });

  describe('deriveFingerprintOverlayHydrationState', () => {
    it('returns defaults mode when no tempo-backed settings are available', () => {
      expect(deriveFingerprintOverlayHydrationState(null)).toEqual({
        source: 'defaults',
        hasTempoSettings: false,
        themeSettings: null,
        overlaySettingsSnapshot: null,
        restoredDetails: null,
      });
    });

    it('returns tempo hydration details when tempo-backed settings are present', () => {
      const settings = getDefaultSettings();
      settings.consentTimestamp = '2026-01-15T10:00:00Z';
      settings.visitCount = 7;
      settings.lastVisit = '2026-01-15T09:55:00Z';
      settings.preferences.theme = 'forest';
      settings.preferences.darkMode = 'system';

      expect(deriveFingerprintOverlayHydrationState(settings)).toEqual({
        source: 'tempo',
        hasTempoSettings: true,
        themeSettings: {
          theme: 'forest',
          darkMode: 'system',
        },
        overlaySettingsSnapshot: {
          settings: {
            'preferences.theme': 'forest',
            'preferences.darkMode': 'system',
            'a11y.reducedMotion': false,
            'a11y.highContrast': false,
            'a11y.fontSize': 'normal',
          },
          lastSyncTime: '2026-01-15T10:00:00Z',
        },
        restoredDetails: {
          visitCount: 7,
          lastVisit: '2026-01-15T09:55:00Z',
          consentTimestamp: '2026-01-15T10:00:00Z',
        },
      });
    });
  });

  describe('applyFingerprintOverlayHydrationState', () => {
    it('initializes theme and hydrates overlay settings for tempo-backed state', async () => {
      const initializeThemeFromServerSettings = vi.fn().mockResolvedValue(undefined);
      const initializeDefaults = vi.fn().mockResolvedValue(undefined);
      const hydrateOverlaySettings = vi.fn();

      const result = await applyFingerprintOverlayHydrationState({
        hydrationState: {
          source: 'tempo',
          hasTempoSettings: true,
          themeSettings: {
            theme: 'forest',
            darkMode: 'system',
          },
          overlaySettingsSnapshot: {
            settings: {
              'preferences.theme': 'forest',
              'preferences.darkMode': 'system',
              'a11y.reducedMotion': false,
              'a11y.highContrast': false,
              'a11y.fontSize': 'normal',
            },
            lastSyncTime: '2026-01-15T10:00:00Z',
          },
          restoredDetails: {
            visitCount: 7,
            lastVisit: '2026-01-15T09:55:00Z',
            consentTimestamp: '2026-01-15T10:00:00Z',
          },
        },
        initializeThemeFromServerSettings,
        initializeDefaults,
        hydrateOverlaySettings,
      });

      expect(initializeThemeFromServerSettings).toHaveBeenCalledWith({
        theme: 'forest',
        darkMode: 'system',
      });
      expect(hydrateOverlaySettings).toHaveBeenCalledWith({
        settings: {
          'preferences.theme': 'forest',
          'preferences.darkMode': 'system',
          'a11y.reducedMotion': false,
          'a11y.highContrast': false,
          'a11y.fontSize': 'normal',
        },
        lastSyncTime: '2026-01-15T10:00:00Z',
      });
      expect(initializeDefaults).not.toHaveBeenCalled();
      expect(result).toEqual({
        source: 'tempo',
        hasTempoSettings: true,
        hydratedOverlaySettings: true,
      });
    });

    it('falls back to default initialization when no tempo-backed state is present', async () => {
      const initializeThemeFromServerSettings = vi.fn().mockResolvedValue(undefined);
      const initializeDefaults = vi.fn().mockResolvedValue(undefined);
      const hydrateOverlaySettings = vi.fn();

      const result = await applyFingerprintOverlayHydrationState({
        hydrationState: {
          source: 'defaults',
          hasTempoSettings: false,
          themeSettings: null,
          overlaySettingsSnapshot: null,
          restoredDetails: null,
        },
        initializeThemeFromServerSettings,
        initializeDefaults,
        hydrateOverlaySettings,
      });

      expect(initializeDefaults).toHaveBeenCalled();
      expect(initializeThemeFromServerSettings).not.toHaveBeenCalled();
      expect(hydrateOverlaySettings).not.toHaveBeenCalled();
      expect(result).toEqual({
        source: 'defaults',
        hasTempoSettings: false,
        hydratedOverlaySettings: false,
      });
    });
  });

  describe('syncFingerprintOverlayChanges', () => {
    it('writes overlay changes through enrichment and returns a sync response', async () => {
      const setAttribute = vi.fn();
      const now = '2026-01-15T10:00:02Z';

      configureFingerprint({
        createSpan: async (_name, fn) => fn({
          setAttribute,
          recordException: vi.fn(),
          setStatus: vi.fn(),
          end: vi.fn(),
        }),
      });

      const result = await syncFingerprintOverlayChanges({
        ctx: {
          headers: { get: () => null },
          url: 'https://tinyland.dev/api/settings/sync',
        },
        fingerprintId: 'fp-sync',
        changes: [
          {
            key: 'preferences.theme',
            value: 'pride',
            timestamp: '2026-01-15T10:00:00Z',
            source: 'user',
          },
        ],
        now: () => now,
      });

      expect(result).toEqual({
        success: true,
        syncedCount: 1,
        timestamp: now,
      });
      expect(setAttribute).toHaveBeenCalledWith(
        'settings.preferences.theme',
        'pride',
      );
      expect(setAttribute).toHaveBeenCalledWith(
        'settings.preferences.theme.timestamp',
        '2026-01-15T10:00:00Z',
      );
    });
  });

  describe('hasTempoBackedSettings', () => {
    it('detects consent-backed settings', () => {
      const settings = getDefaultSettings();
      settings.consentTimestamp = '2026-01-15T10:00:00Z';

      expect(hasTempoBackedSettings(settings)).toBe(true);
      expect(hasTempoBackedSettings(getDefaultSettings())).toBe(false);
      expect(hasTempoBackedSettings(null)).toBe(false);
    });
  });
});
