/**
 * Fingerprint package configuration via dependency injection.
 *
 * All external dependencies (logging, tracing, security functions, data fetchers)
 * are provided through configuration callbacks rather than direct imports.
 * When a callback is not provided, a sensible no-op default is used.
 *
 * @module config
 */

/**
 * Logger interface matching common structured loggers.
 */
export interface FingerprintLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

/**
 * File logger interface for audit trails (writes to file for Alloy/Loki collection).
 */
export interface FingerprintFileLogger {
  write: (entry: {
    level: string;
    message: string;
    timestamp: number;
    component: string;
    event_type: string;
    [key: string]: any;
  }) => Promise<void>;
}

/**
 * Span interface for tracing instrumentation.
 */
export interface FingerprintSpan {
  setAttribute: (key: string, value: any) => void;
  recordException: (error: Error) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  end: () => void;
}

/**
 * Tracer interface for creating active spans.
 */
export interface FingerprintTracer {
  startActiveSpan: <T>(name: string, fn: (span: FingerprintSpan) => Promise<T>) => Promise<T>;
}

/**
 * GeoLocation result from IP lookup.
 */
export interface GeoLocationResult {
  country: string;
  countryCode: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  accuracyRadius: number | null;
  source?: 'browser-geolocation' | 'maxmind-geoip' | 'mock-development';
}

/**
 * VPN detection result.
 */
export interface VPNDetectionResult {
  isVPN: boolean;
  provider: string | null;
  confidence: 'low' | 'medium' | 'high';
  method: 'asn' | 'datacenter' | 'unknown';
  details?: string;
}

/**
 * Risk score result from security analysis.
 */
export interface RiskScoreResult {
  score: number;
  tier: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{ name: string; score: number; description: string }>;
  recommendation: string;
}

/**
 * Observability data fetcher (Loki, Tempo).
 */
export interface ObservabilityFetcher {
  fetchLoki: (path: string, options?: RequestInit) => Promise<Response>;
}

/**
 * Tempo query service interface for trace-based queries.
 */
export interface TempoQueryServiceInterface {
  queryFingerprints: (
    timeRange: string,
    filters: Record<string, string>,
    limit?: number
  ) => Promise<any[]>;
  searchTraces: (
    traceQL: string,
    startSeconds: number,
    endSeconds: number
  ) => Promise<any[]>;
  getTagValueSuggestions: (
    tagName: string,
    prefix: string,
    limit?: number
  ) => Promise<string[]>;
}

/**
 * Child span reader interface for backward-compatible geo data extraction.
 */
export interface ChildSpanReaderInterface {
  readGeo: (trace: any) => Promise<{
    country: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    source: string;
  } | null>;
}

/**
 * User flags fetcher for authenticated user context.
 */
export interface UserFlagsFetcher {
  getUserFlags: (userId: string) => Promise<{
    totpEnabled: boolean;
    isActive: boolean;
    lastLogin: string | null;
    loginCount: number;
    failedLoginAttempts: number;
  } | undefined>;
}

/**
 * Reverse geocoding function.
 */
export type ReverseGeocodeFn = (
  latitude: number,
  longitude: number,
  context?: { fingerprintId?: string; sessionId?: string | null }
) => Promise<GeoLocationResult | null>;

/**
 * Consent categories (locally defined to avoid monorepo dependency).
 */
export interface ConsentCategories {
  essential: boolean;
  preferences: boolean;
  functional: boolean;
  tracking: boolean;
  performance: boolean;
}

/**
 * Default consent state: essential only.
 */
export const DEFAULT_CONSENT: ConsentCategories = {
  essential: true,
  preferences: false,
  functional: false,
  tracking: false,
  performance: false,
};

/**
 * Restorable settings (locally defined to avoid monorepo dependency).
 */
export interface RestorableSettings {
  lastKnownLocation: {
    city: string | null;
    country: string;
    latitude: number | null;
    longitude: number | null;
  };
  deviceContext: {
    deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    browserName: string;
    browserVersion: string;
    os: string;
  };
  lastVisit: {
    pathname: string;
    timestamp: string;
    referrerHostname: string | null;
  };
  userContext: {
    handle: string | null;
    role: string | null;
  };
  a11yPreferences: {
    reducedMotion: boolean;
    highContrast: boolean;
    screenReaderDetected: boolean;
  };
  preferences?: {
    theme?: string;
    darkMode?: 'light' | 'dark' | 'system';
    a11y?: {
      reducedMotion?: boolean;
      highContrast?: boolean;
      fontSize?: 'normal' | 'large' | 'x-large';
    };
  };
  consentCategories?: ConsentCategories;
}

/**
 * Consent record (locally defined to avoid monorepo dependency).
 */
export interface ConsentRecord {
  fingerprintId: string;
  categories: ConsentCategories;
  preciseLocation: boolean;
  ageVerified: boolean;
  optionalHandle: string | null;
  preferences: {
    theme: string;
    darkMode: 'light' | 'dark' | 'system';
  };
  consentTimestamp: string;
  consentVersion: string;
}

/**
 * Complete fingerprint configuration.
 *
 * All callbacks are optional. When not provided, sensible defaults are used:
 * - Logger: `console` fallback
 * - Security functions: identity/no-op
 * - Tracing: no-op spans
 * - Fetchers: throw errors (must be provided for data services)
 */
export interface FingerprintConfig {
  // Logging
  logger?: FingerprintLogger;
  scopedLogger?: (scope: string) => FingerprintLogger;

  // Tracing (optional OTel integration)
  createSpan?: <T>(
    name: string,
    fn: (span: FingerprintSpan) => Promise<T>,
    options?: { kind?: number }
  ) => Promise<T>;
  getTracer?: () => FingerprintTracer;

  // Security functions (from tinyland-security or config injection)
  hashFingerprint?: (fp: string) => string | Promise<string>;
  hashIp?: (ip: string) => string;
  encryptIP?: (ip: string) => string;
  calculateRiskScore?: (enriched: any, context?: any) => RiskScoreResult;
  detectVPN?: (ip: string) => Promise<VPNDetectionResult>;
  isPrivateIP?: (ip: string) => boolean;
  getLocation?: (ip: string) => GeoLocationResult | null;
  isGeoIPAvailable?: () => boolean;
  reverseGeocode?: ReverseGeocodeFn;

  // File logger for audit trails
  fileLogger?: FingerprintFileLogger;

  // Observability data sources
  observabilityFetcher?: ObservabilityFetcher;
  tempoQueryService?: TempoQueryServiceInterface;
  childSpanReader?: ChildSpanReaderInterface;

  // User data fetcher
  userFlagsFetcher?: UserFlagsFetcher;

  // Observability config
  lokiUrl?: string;

  // Data directory
  dataDir?: string;

  // Consent defaults
  defaultConsent?: ConsentCategories;

  // Environment
  nodeEnv?: string;
}

// ---------------------------------------------------------------------------
// Singleton configuration
// ---------------------------------------------------------------------------

const noopLogger: FingerprintLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const consoleLogger: FingerprintLogger = {
  info: (...args: any[]) => console.log('[fingerprint:info]', ...args),
  warn: (...args: any[]) => console.warn('[fingerprint:warn]', ...args),
  error: (...args: any[]) => console.error('[fingerprint:error]', ...args),
  debug: (...args: any[]) => console.debug('[fingerprint:debug]', ...args),
};

let _config: FingerprintConfig = {};

/**
 * Configure the fingerprint package.
 *
 * Call this once at application startup to inject external dependencies.
 *
 * @example
 * ```typescript
 * import { configureFingerprint } from '@tinyland-inc/tinyland-fingerprint';
 * configureFingerprint({
 *   logger: myLogger,
 *   hashFingerprint: myHashFn,
 *   detectVPN: myVpnDetector,
 * });
 * ```
 */
export function configureFingerprint(config: Partial<FingerprintConfig>): void {
  _config = { ..._config, ...config };
}

/**
 * Get the current fingerprint configuration.
 *
 * Returns the merged configuration with sensible defaults for missing callbacks.
 */
export function getFingerprintConfig(): Required<
  Pick<FingerprintConfig, 'logger' | 'nodeEnv' | 'defaultConsent'>
> &
  FingerprintConfig {
  return {
    ..._config,
    logger: _config.logger ?? consoleLogger,
    nodeEnv: _config.nodeEnv ?? (typeof process !== 'undefined' ? process.env.NODE_ENV ?? 'development' : 'development'),
    defaultConsent: _config.defaultConsent ?? DEFAULT_CONSENT,
  };
}

/**
 * Get a scoped logger from configuration.
 *
 * If `scopedLogger` is configured, uses that factory.
 * Otherwise returns the configured logger or console fallback.
 */
export function getScopedLogger(scope: string): FingerprintLogger {
  const config = getFingerprintConfig();
  if (config.scopedLogger) {
    return config.scopedLogger(scope);
  }
  return config.logger;
}

/**
 * Reset configuration to defaults (primarily for testing).
 */
export function resetFingerprintConfig(): void {
  _config = {};
}

/**
 * No-op span for when tracing is not configured.
 */
export const noopSpan: FingerprintSpan = {
  setAttribute: () => {},
  recordException: () => {},
  setStatus: () => {},
  end: () => {},
};

/**
 * Create a span using configured tracing, or execute directly with no-op span.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: FingerprintSpan) => Promise<T>,
  options?: { kind?: number }
): Promise<T> {
  const config = getFingerprintConfig();
  if (config.createSpan) {
    return config.createSpan(name, fn, options);
  }
  return fn(noopSpan);
}

/**
 * Use the configured tracer to start an active span, or execute with no-op.
 */
export async function withTracerSpan<T>(
  name: string,
  fn: (span: FingerprintSpan) => Promise<T>
): Promise<T> {
  const config = getFingerprintConfig();
  if (config.getTracer) {
    const tracer = config.getTracer();
    return tracer.startActiveSpan(name, fn);
  }
  return fn(noopSpan);
}
