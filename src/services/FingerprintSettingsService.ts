/**
 * Fingerprint Settings Service
 *
 * Uses TempoQL to restore user settings from fingerprint history.
 * This is a NOVEL ACHIEVEMENT: using Tempo as a fingerprint-indexed settings database.
 *
 * All external dependencies are injected via the config module.
 *
 * @module services/FingerprintSettingsService
 */

import {
  getScopedLogger,
  getFingerprintConfig,
  withTracerSpan,
  noopSpan,
  type FingerprintSpan,
  type ConsentCategories,
  type RestorableSettings,
  DEFAULT_CONSENT,
} from '../config.js';

const logger = getScopedLogger('fingerprint-settings-service');

// OTel status codes
const SpanStatusCode = {
  OK: 1,
  ERROR: 2,
};

/**
 * Complete fingerprint settings restored from Tempo.
 */
export interface FingerprintSettings {
  categories: ConsentCategories;
  preciseLocation: boolean;
  ageVerified: boolean;
  optionalHandle: string | null;
  preferences: {
    theme: string;
    darkMode: 'light' | 'dark' | 'system';
  };
  a11y: {
    reducedMotion: boolean;
    highContrast: boolean;
    fontSize: 'normal' | 'large' | 'x-large';
  };
  contentPage: {
    forceTheme: string | null;
    forceDarkMode: 'light' | 'dark' | null;
    forceA11y: boolean;
  };
  location: {
    city: string | null;
    country: string;
    latitude: number | null;
    longitude: number | null;
    source: 'geoip' | 'precise' | 'unknown';
  };
  device: {
    type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    browser: string;
    browserVersion: string;
    os: string;
  };
  visitCount: number;
  lastVisit: string | null;
  consentVersion: string | null;
  consentTimestamp: string | null;
}

/**
 * Visit history entry for fingerprint.
 */
export interface VisitSummary {
  timestamp: string;
  pathname: string | null;
  referrer: string | null;
  location: {
    city: string | null;
    country: string | null;
  };
  device: string | null;
}

/**
 * Default settings for first-time visitors.
 */
export function getDefaultSettings(): FingerprintSettings {
  return {
    categories: { ...DEFAULT_CONSENT },
    preciseLocation: false,
    ageVerified: false,
    optionalHandle: null,
    preferences: {
      theme: 'trans',
      darkMode: 'system'
    },
    a11y: {
      reducedMotion: false,
      highContrast: false,
      fontSize: 'normal'
    },
    contentPage: {
      forceTheme: null,
      forceDarkMode: null,
      forceA11y: false
    },
    location: {
      city: null,
      country: 'Unknown',
      latitude: null,
      longitude: null,
      source: 'unknown'
    },
    device: {
      type: 'unknown',
      browser: 'Unknown',
      browserVersion: '',
      os: 'Unknown'
    },
    visitCount: 0,
    lastVisit: null,
    consentVersion: null,
    consentTimestamp: null
  };
}

/**
 * Restore fingerprint settings from Tempo trace history.
 */
export async function restoreFingerprintSettings(
  fingerprintId: string
): Promise<RestorableSettings | null> {
  return withTracerSpan('fingerprint.settings.restore', async (span: FingerprintSpan) => {
    const config = getFingerprintConfig();
    try {
      span.setAttribute('fingerprint.id', fingerprintId);

      if (!config.tempoQueryService) {
        span.setAttribute('settings.found', false);
        return null;
      }

      logger.info('Restoring fingerprint settings from Tempo', { fingerprintId });

      const traces = await config.tempoQueryService.queryFingerprints(
        '168h',
        { 'fingerprint.id': fingerprintId },
        1
      );

      if (!traces || traces.length === 0) {
        span.setAttribute('settings.found', false);
        logger.info('No previous visits found for fingerprint', { fingerprintId });
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const lastTrace = traces[0];
      span.setAttribute('settings.found', true);
      span.setAttribute('settings.lastVisit', lastTrace.timestamp);

      const settings: RestorableSettings = {
        lastKnownLocation: {
          city: lastTrace.geoCity || null,
          country: lastTrace.geoCountry || 'Unknown',
          latitude: lastTrace.geoLatitude || null,
          longitude: lastTrace.geoLongitude || null
        },
        deviceContext: {
          deviceType: (lastTrace.deviceType as 'mobile' | 'tablet' | 'desktop' | 'unknown') || 'unknown',
          browserName: lastTrace.browserName || 'Unknown',
          browserVersion: lastTrace.browserVersion || '',
          os: lastTrace.osName || 'Unknown'
        },
        lastVisit: {
          pathname: lastTrace.navigationPathname || '/',
          timestamp: lastTrace.timestamp,
          referrerHostname: lastTrace.navigationReferrerHostname || null
        },
        userContext: {
          handle: lastTrace.userHandle || null,
          role: lastTrace.userRole || null
        },
        a11yPreferences: {
          reducedMotion: false,
          highContrast: false,
          screenReaderDetected: false
        }
      };

      logger.info('Fingerprint settings restored successfully', {
        fingerprintId,
        lastVisit: lastTrace.timestamp,
        city: lastTrace.geoCity,
        country: lastTrace.geoCountry
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return settings;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });

      logger.error('Failed to restore fingerprint settings', {
        error: error instanceof Error ? error.message : String(error),
        fingerprintId
      });

      return null;
    } finally {
      span.end();
    }
  });
}

/**
 * Get the total number of visits for a fingerprint.
 */
export async function getFingerprintVisitCount(fingerprintId: string): Promise<number> {
  return withTracerSpan('fingerprint.visitCount', async (span: FingerprintSpan) => {
    const config = getFingerprintConfig();
    try {
      span.setAttribute('fingerprint.id', fingerprintId);

      if (!config.tempoQueryService) return 0;

      const traces = await config.tempoQueryService.queryFingerprints(
        '168h',
        { 'fingerprint.id': fingerprintId },
        1000
      );

      const count = traces?.length || 0;
      span.setAttribute('visitCount', count);
      span.setStatus({ code: SpanStatusCode.OK });
      return count;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });

      logger.error('Failed to get visit count', {
        error: error instanceof Error ? error.message : String(error),
        fingerprintId
      });

      return 0;
    } finally {
      span.end();
    }
  });
}

/**
 * Calculate time since last visit.
 */
export function getTimeSinceLastVisit(timestamp: string): { value: number; unit: string } {
  const lastVisit = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - lastVisit.getTime();

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 60) return { value: diffMinutes, unit: diffMinutes === 1 ? 'minute' : 'minutes' };
  if (diffHours < 24) return { value: diffHours, unit: diffHours === 1 ? 'hour' : 'hours' };
  if (diffDays < 7) return { value: diffDays, unit: diffDays === 1 ? 'day' : 'days' };
  if (diffWeeks < 4) return { value: diffWeeks, unit: diffWeeks === 1 ? 'week' : 'weeks' };
  return { value: diffMonths, unit: diffMonths === 1 ? 'month' : 'months' };
}

/**
 * Format time since last visit as human-readable string.
 */
export function formatTimeSinceLastVisit(timestamp: string): string {
  const { value, unit } = getTimeSinceLastVisit(timestamp);
  return `${value} ${unit} ago`;
}

/**
 * Check if fingerprint has previous consent.
 */
export async function hasPreviousConsent(fingerprintId: string): Promise<boolean> {
  return withTracerSpan('fingerprint.hasConsent', async (span: FingerprintSpan) => {
    const config = getFingerprintConfig();
    try {
      span.setAttribute('fingerprint.id', fingerprintId);

      if (!config.tempoQueryService) return false;

      const traces = await config.tempoQueryService.queryFingerprints(
        '168h',
        { 'fingerprint.id': fingerprintId },
        1
      );

      const hasConsent = (traces?.length || 0) > 0;
      span.setAttribute('hasConsent', hasConsent);
      span.setStatus({ code: SpanStatusCode.OK });
      return hasConsent;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });

      logger.error('Failed to check previous consent', {
        error: error instanceof Error ? error.message : String(error),
        fingerprintId
      });

      return false;
    } finally {
      span.end();
    }
  });
}

/**
 * Restore ALL settings for a fingerprint from Tempo.
 */
export async function restoreFullSettings(
  fingerprintId: string
): Promise<FingerprintSettings> {
  return withTracerSpan('fingerprint.settings.restoreFull', async (span: FingerprintSpan) => {
    const config = getFingerprintConfig();
    try {
      span.setAttribute('fingerprint.id', fingerprintId);

      if (!config.tempoQueryService) {
        return getDefaultSettings();
      }

      logger.info('Restoring full fingerprint settings from Tempo', { fingerprintId });

      const now = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60);

      const enrichmentTraces = await config.tempoQueryService.queryFingerprints(
        '168h',
        { 'fingerprint.id': fingerprintId },
        100
      );

      let consentTraces: any[] = [];
      try {
        consentTraces = await config.tempoQueryService.searchTraces(
          `{ name = "consent.submission" && span.consent.fingerprint_id = "${fingerprintId}" }`,
          sevenDaysAgo,
          now
        ) || [];
      } catch {
        // consent.submission is fallback only
      }

      span.setAttribute('consent.traces.count', consentTraces?.length || 0);
      span.setAttribute('enrichment.traces.count', enrichmentTraces?.length || 0);

      const settings = getDefaultSettings();
      settings.visitCount = enrichmentTraces?.length || 0;

      let consentFound = false;
      if (enrichmentTraces && enrichmentTraces.length > 0) {
        const mostRecentTrace = enrichmentTraces[0];
        if (mostRecentTrace.preferencesTheme) {
          settings.preferences.theme = mostRecentTrace.preferencesTheme;
        }
        if (mostRecentTrace.preferencesDarkMode) {
          settings.preferences.darkMode = mostRecentTrace.preferencesDarkMode as 'light' | 'dark' | 'system';
        }
        if (mostRecentTrace.consentOptionalHandle) {
          settings.optionalHandle = mostRecentTrace.consentOptionalHandle;
        }

        for (const trace of enrichmentTraces) {
          if (trace.consentTimestamp) {
            settings.consentTimestamp = trace.consentTimestamp;
            settings.consentVersion = trace.consentVersion || null;

            if (trace.consentCategoriesEssential !== undefined) {
              settings.categories.essential = trace.consentCategoriesEssential === true || String(trace.consentCategoriesEssential) === 'true';
            }
            if (trace.consentCategoriesPreferences !== undefined) {
              settings.categories.preferences = trace.consentCategoriesPreferences === true || String(trace.consentCategoriesPreferences) === 'true';
            }
            if (trace.consentCategoriesFunctional !== undefined) {
              settings.categories.functional = trace.consentCategoriesFunctional === true || String(trace.consentCategoriesFunctional) === 'true';
            }
            if (trace.consentCategoriesTracking !== undefined) {
              settings.categories.tracking = trace.consentCategoriesTracking === true || String(trace.consentCategoriesTracking) === 'true';
            }
            if (trace.consentCategoriesPerformance !== undefined) {
              settings.categories.performance = trace.consentCategoriesPerformance === true || String(trace.consentCategoriesPerformance) === 'true';
            }

            if (trace.consentPreciseLocation !== undefined) {
              settings.preciseLocation = trace.consentPreciseLocation === true || String(trace.consentPreciseLocation) === 'true';
            }
            if (trace.consentAgeVerified !== undefined) {
              settings.ageVerified = trace.consentAgeVerified === true || String(trace.consentAgeVerified) === 'true';
            }
            if (!settings.optionalHandle && trace.consentOptionalHandle) {
              settings.optionalHandle = trace.consentOptionalHandle;
            }

            consentFound = true;
            span.setAttribute('consent.found', true);
            span.setAttribute('consent.source', 'enrichment');
            span.setAttribute('consent.timestamp', settings.consentTimestamp || 'unknown');
            break;
          }
        }
      }

      // FALLBACK: consent.submission spans (legacy flow)
      if (!consentFound && consentTraces && consentTraces.length > 0) {
        const sortedConsent = [...consentTraces].sort((a: any, b: any) => {
          const aTime = parseInt(a.startTimeUnixNano || '0');
          const bTime = parseInt(b.startTimeUnixNano || '0');
          return bTime - aTime;
        });

        const latestConsent = sortedConsent[0];
        const attrs = extractSpanAttributes(latestConsent);

        if (attrs) {
          settings.categories = {
            essential: attrs['consent.categories.essential'] === 'true',
            preferences: attrs['consent.categories.preferences'] === 'true',
            functional: attrs['consent.categories.functional'] === 'true',
            tracking: attrs['consent.categories.tracking'] === 'true',
            performance: attrs['consent.categories.performance'] === 'true'
          };

          settings.preciseLocation = attrs['consent.preciseLocation'] === 'true';
          settings.ageVerified = attrs['consent.ageVerified'] === 'true';
          settings.optionalHandle = attrs['consent.optionalHandle'] || null;

          if (attrs['consent.preferences.theme']) {
            settings.preferences.theme = attrs['consent.preferences.theme'];
          }
          if (attrs['consent.preferences.darkMode']) {
            settings.preferences.darkMode = attrs['consent.preferences.darkMode'] as 'light' | 'dark' | 'system';
          }

          settings.consentTimestamp = attrs['consent.timestamp'] || null;
          settings.consentVersion = attrs['consent.version'] || null;

          span.setAttribute('consent.found', true);
          span.setAttribute('consent.source', 'consent.submission');
          span.setAttribute('consent.timestamp', settings.consentTimestamp || 'unknown');
        }
      }

      // Extract device/location from most recent enrichment trace
      if (enrichmentTraces && enrichmentTraces.length > 0) {
        const latestEnrichment = enrichmentTraces[0];
        settings.lastVisit = latestEnrichment.timestamp;
        settings.location = {
          city: latestEnrichment.geoCity || null,
          country: latestEnrichment.geoCountry || 'Unknown',
          latitude: latestEnrichment.geoLatitude ?? null,
          longitude: latestEnrichment.geoLongitude ?? null,
          source: (latestEnrichment.geoSource as 'geoip' | 'precise' | 'unknown') || 'unknown'
        };
        settings.device = {
          type: (latestEnrichment.deviceType as 'mobile' | 'tablet' | 'desktop' | 'unknown') || 'unknown',
          browser: latestEnrichment.browserName || 'Unknown',
          browserVersion: latestEnrichment.browserVersion || '',
          os: latestEnrichment.osName || 'Unknown'
        };
        span.setAttribute('location.country', settings.location.country);
        span.setAttribute('device.type', settings.device.type);
      }

      logger.info('Full fingerprint settings restored', {
        fingerprintId,
        visitCount: settings.visitCount,
        hasConsent: !!settings.consentTimestamp,
        theme: settings.preferences.theme
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return settings;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });

      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to restore full fingerprint settings', {
        error: errorMessage,
        fingerprintId
      });

      const isTempoDown =
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ENOTFOUND');

      if (isTempoDown) {
        logger.warn('Tempo unavailable, throwing error for client-side retry', {
          fingerprintId: fingerprintId.slice(0, 16),
          error: errorMessage
        });
        throw new Error(`Tempo unavailable: ${errorMessage}`);
      }

      logger.info('Non-Tempo error, returning defaults', {
        fingerprintId: fingerprintId.slice(0, 16),
      });
      return getDefaultSettings();
    } finally {
      span.end();
    }
  });
}

/**
 * Get visit history summary for fingerprint.
 */
export async function getVisitHistory(
  fingerprintId: string,
  limit: number = 10
): Promise<VisitSummary[]> {
  return withTracerSpan('fingerprint.settings.visitHistory', async (span: FingerprintSpan) => {
    const config = getFingerprintConfig();
    try {
      span.setAttribute('fingerprint.id', fingerprintId);
      span.setAttribute('limit', limit);

      if (!config.tempoQueryService) return [];

      const traces = await config.tempoQueryService.queryFingerprints(
        '2160h',
        { 'fingerprint.id': fingerprintId },
        limit
      );

      const history: VisitSummary[] = (traces || []).map((t: any) => ({
        timestamp: t.timestamp,
        pathname: t.navigationPathname || null,
        referrer: t.navigationReferrerHostname || null,
        location: { city: t.geoCity || null, country: t.geoCountry || null },
        device: t.deviceType || null
      }));

      span.setAttribute('history.count', history.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return history;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });

      logger.error('Failed to get visit history', {
        error: error instanceof Error ? error.message : String(error),
        fingerprintId
      });

      return [];
    } finally {
      span.end();
    }
  });
}

/**
 * Helper to extract span attributes from Tempo search response trace.
 */
function extractSpanAttributes(trace: any): Record<string, string> | null {
  try {
    const span = trace?.spanSet?.spans?.[0];
    if (!span?.attributes) return null;

    const attrs: Record<string, string> = {};
    for (const attr of span.attributes) {
      const value = attr.value?.stringValue ||
        (attr.value?.boolValue !== undefined ? String(attr.value.boolValue) : null) ||
        (attr.value?.intValue !== undefined ? String(attr.value.intValue) : null) ||
        (attr.value?.doubleValue !== undefined ? String(attr.value.doubleValue) : null);

      if (value !== null) {
        attrs[attr.key] = value;
      }
    }
    return attrs;
  } catch {
    return null;
  }
}
