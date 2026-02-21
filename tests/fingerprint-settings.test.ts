import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDefaultSettings,
  getTimeSinceLastVisit,
  formatTimeSinceLastVisit,
  restoreFingerprintSettings,
  restoreFullSettings,
  getFingerprintVisitCount,
  hasPreviousConsent,
  getVisitHistory,
} from '../src/services/FingerprintSettingsService.js';
import { configureFingerprint, resetFingerprintConfig, DEFAULT_CONSENT } from '../src/config.js';

describe('FingerprintSettingsService', () => {
  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('getDefaultSettings', () => {
    it('should return complete default settings', () => {
      const settings = getDefaultSettings();

      expect(settings.categories).toEqual(DEFAULT_CONSENT);
      expect(settings.preciseLocation).toBe(false);
      expect(settings.ageVerified).toBe(false);
      expect(settings.optionalHandle).toBeNull();
      expect(settings.preferences.theme).toBe('trans');
      expect(settings.preferences.darkMode).toBe('system');
      expect(settings.a11y.reducedMotion).toBe(false);
      expect(settings.a11y.highContrast).toBe(false);
      expect(settings.a11y.fontSize).toBe('normal');
      expect(settings.contentPage.forceTheme).toBeNull();
      expect(settings.contentPage.forceDarkMode).toBeNull();
      expect(settings.contentPage.forceA11y).toBe(false);
      expect(settings.location.country).toBe('Unknown');
      expect(settings.device.type).toBe('unknown');
      expect(settings.visitCount).toBe(0);
      expect(settings.lastVisit).toBeNull();
      expect(settings.consentVersion).toBeNull();
      expect(settings.consentTimestamp).toBeNull();
    });
  });

  describe('getTimeSinceLastVisit', () => {
    it('should return minutes for recent visits', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = getTimeSinceLastVisit(tenMinutesAgo);
      expect(result.value).toBeCloseTo(10, 0);
      expect(result.unit).toBe('minutes');
    });

    it('should return hours for same-day visits', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const result = getTimeSinceLastVisit(threeHoursAgo);
      expect(result.value).toBeCloseTo(3, 0);
      expect(result.unit).toBe('hours');
    });

    it('should return days for recent visits', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = getTimeSinceLastVisit(twoDaysAgo);
      expect(result.value).toBeCloseTo(2, 0);
      expect(result.unit).toBe('days');
    });

    it('should return weeks for older visits', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const result = getTimeSinceLastVisit(twoWeeksAgo);
      expect(result.value).toBe(2);
      expect(result.unit).toBe('weeks');
    });

    it('should use singular for value of 1', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const result = getTimeSinceLastVisit(oneHourAgo);
      expect(result.value).toBe(1);
      expect(result.unit).toBe('hour');
    });
  });

  describe('formatTimeSinceLastVisit', () => {
    it('should format as human-readable string', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = formatTimeSinceLastVisit(tenMinutesAgo);
      expect(result).toMatch(/10 minutes ago/);
    });
  });

  describe('restoreFingerprintSettings', () => {
    it('should return null when tempo not configured', async () => {
      const result = await restoreFingerprintSettings('fp-123');
      expect(result).toBeNull();
    });

    it('should return null for first-time visitor', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await restoreFingerprintSettings('fp-new');
      expect(result).toBeNull();
    });

    it('should return settings for returning visitor', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([{
            timestamp: '2026-01-15T10:00:00Z',
            geoCity: 'Ithaca',
            geoCountry: 'United States',
            geoLatitude: 42.4406,
            geoLongitude: -76.4966,
            deviceType: 'desktop',
            browserName: 'Firefox',
            browserVersion: '121.0',
            osName: 'Linux',
            navigationPathname: '/admin',
            navigationReferrerHostname: null,
            userHandle: 'testuser',
            userRole: 'admin',
          }]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await restoreFingerprintSettings('fp-returning');
      expect(result).not.toBeNull();
      expect(result!.lastKnownLocation.city).toBe('Ithaca');
      expect(result!.lastKnownLocation.country).toBe('United States');
      expect(result!.deviceContext.browserName).toBe('Firefox');
      expect(result!.deviceContext.os).toBe('Linux');
      expect(result!.lastVisit.pathname).toBe('/admin');
      expect(result!.userContext.handle).toBe('testuser');
    });
  });

  describe('getFingerprintVisitCount', () => {
    it('should return 0 when tempo not configured', async () => {
      const count = await getFingerprintVisitCount('fp-123');
      expect(count).toBe(0);
    });

    it('should return trace count', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue(new Array(42).fill({ timestamp: new Date().toISOString() })),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const count = await getFingerprintVisitCount('fp-active');
      expect(count).toBe(42);
    });
  });

  describe('hasPreviousConsent', () => {
    it('should return false when tempo not configured', async () => {
      const result = await hasPreviousConsent('fp-123');
      expect(result).toBe(false);
    });

    it('should return true when traces exist', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([{ timestamp: new Date().toISOString() }]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await hasPreviousConsent('fp-consented');
      expect(result).toBe(true);
    });
  });

  describe('restoreFullSettings', () => {
    it('should return defaults when tempo not configured', async () => {
      const result = await restoreFullSettings('fp-123');
      expect(result).toEqual(getDefaultSettings());
    });

    it('should restore consent categories from enrichment traces', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([{
            timestamp: '2026-01-15T10:00:00Z',
            geoCity: 'Ithaca',
            geoCountry: 'United States',
            deviceType: 'desktop',
            browserName: 'Firefox',
            browserVersion: '121.0',
            osName: 'Linux',
            preferencesTheme: 'pride',
            preferencesDarkMode: 'dark',
            consentTimestamp: '2026-01-14T08:00:00Z',
            consentVersion: '1.0',
            consentCategoriesEssential: true,
            consentCategoriesPreferences: true,
            consentCategoriesFunctional: false,
            consentCategoriesTracking: true,
            consentCategoriesPerformance: false,
          }]),
          searchTraces: vi.fn().mockResolvedValue([]),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const result = await restoreFullSettings('fp-full');
      expect(result.preferences.theme).toBe('pride');
      expect(result.preferences.darkMode).toBe('dark');
      expect(result.consentTimestamp).toBe('2026-01-14T08:00:00Z');
      expect(result.categories.essential).toBe(true);
      expect(result.categories.preferences).toBe(true);
      expect(result.categories.functional).toBe(false);
      expect(result.categories.tracking).toBe(true);
      expect(result.categories.performance).toBe(false);
      expect(result.location.country).toBe('United States');
      expect(result.device.browser).toBe('Firefox');
    });
  });

  describe('getVisitHistory', () => {
    it('should return empty when tempo not configured', async () => {
      const history = await getVisitHistory('fp-123');
      expect(history).toEqual([]);
    });

    it('should return visit summaries', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-01-15T10:00:00Z',
              navigationPathname: '/admin',
              navigationReferrerHostname: 'google.com',
              geoCity: 'Ithaca',
              geoCountry: 'United States',
              deviceType: 'desktop',
            },
            {
              timestamp: '2026-01-14T08:00:00Z',
              navigationPathname: '/',
              navigationReferrerHostname: null,
              geoCity: 'Ithaca',
              geoCountry: 'United States',
              deviceType: 'mobile',
            }
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const history = await getVisitHistory('fp-history', 10);
      expect(history).toHaveLength(2);
      expect(history[0].pathname).toBe('/admin');
      expect(history[0].referrer).toBe('google.com');
      expect(history[1].device).toBe('mobile');
    });
  });
});
