











import { getScopedLogger, getFingerprintConfig, withSpan, type FingerprintSpan } from '../config.js';
import type { EnrichedFingerprint, DeviceType } from '../types/fingerprint.js';
import { UAParser } from 'ua-parser-js';

const logger = getScopedLogger('fingerprint-enrichment');


export type { EnrichedFingerprint } from '../types/fingerprint.js';




export interface ConsentPreferenceData {
  consent?: {
    categories?: string[];
    categoriesRecord?: {
      essential?: boolean;
      preferences?: boolean;
      functional?: boolean;
      tracking?: boolean;
      performance?: boolean;
    };
    timestamp?: string;
    version?: string;
    preciseLocation?: boolean;
    ageVerified?: boolean;
    optionalHandle?: string;
  };
  preferences?: {
    theme?: string;
    darkMode?: boolean | string;
    a11y?: {
      reducedMotion?: boolean;
      highContrast?: boolean;
      fontSize?: string;
    };
    contentPage?: {
      forceTheme?: string;
      forceDarkMode?: boolean | string;
      forceA11y?: boolean;
    };
  };
}




export interface FingerprintRequestContext {
  headers: {
    get: (name: string) => string | null;
  };
  url: string;
  
  session?: {
    id?: string;
    userId?: string;
  };
  user?: {
    id?: string;
    username?: string;
    role?: string;
  };
  
  cookies?: {
    get: (name: string) => string | undefined;
  };
  
  getClientAddress?: () => string;
}

export type FingerprintAdditionalAttributes = Record<
  string,
  string | boolean | number
>;

export interface FingerprintEnrichmentOptions {
  additionalAttributes?: FingerprintAdditionalAttributes;
}




export function classifyDevice(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();
  if (/(iphone|ipod|android.*mobile|windows phone|blackberry)/i.test(ua)) return 'mobile';
  if (/(ipad|android(?!.*mobile)|tablet)/i.test(ua)) return 'tablet';
  if (/(windows|macintosh|linux|x11)/i.test(ua)) return 'desktop';
  return 'unknown';
}






export function maskIpAddress(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, Math.min(3, parts.length)).join(':') + '::*';
  } else {
    const parts = ip.split('.');
    return parts.slice(0, 2).join('.') + '.*.*';
  }
}




function parseDetailedComponents(detailedFingerprint: any): EnrichedFingerprint['components'] {
  if (!detailedFingerprint || !detailedFingerprint.components) {
    return {};
  }

  const components = detailedFingerprint.components;

  return {
    canvas: components.canvas?.value?.toString(),
    webgl: components.webgl?.value?.toString(),
    audio: components.audio?.value?.toString(),
    fonts: components.fonts?.value,
    plugins: components.plugins?.value?.map((p: any) => p.name),
    screenResolution: components.screenResolution?.value
      ? `${components.screenResolution.value[0]}x${components.screenResolution.value[1]}`
      : undefined,
    timezone: components.timezone?.value,
    language: components.languages?.value?.[0]?.[0],
    platform: components.platform?.value,
    cookiesEnabled: components.cookieEnabled?.value,
    localStorage: components.localStorage?.value
  };
}




export function parseUserAgent(userAgent: string) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser_name: result.browser.name || null,
    browser_version: result.browser.version || null,
    browser_major_version: result.browser.major ? parseInt(result.browser.major) : null,
    os: result.os.name || null,
    os_version: result.os.version || null,
    engine: result.engine.name || null,
    engine_version: result.engine.version || null
  };
}













export async function enrichFingerprint(
  ctx: FingerprintRequestContext,
  fingerprintId: string,
  detailedFingerprint?: any,
  eventType: EnrichedFingerprint['eventType'] = 'session_validated',
  consentPreferences?: ConsentPreferenceData,
  options: FingerprintEnrichmentOptions = {}
): Promise<EnrichedFingerprint> {
  const config = getFingerprintConfig();

  return withSpan('fingerprint.enrichment', async (span: FingerprintSpan) => {
    span.setAttribute('fingerprint.id', fingerprintId);
    span.setAttribute('fingerprint.event_type', eventType);

    
    const rawIpWithPort =
      ctx.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      ctx.headers.get('x-real-ip') ||
      (ctx.getClientAddress ? ctx.getClientAddress() : null) ||
      'unknown';

    const rawIp = rawIpWithPort.includes(':') && !rawIpWithPort.startsWith('[')
      ? rawIpWithPort.split(':')[0]
      : rawIpWithPort;

    
    const hashFp = config.hashFingerprint ?? ((fp: string) => fp);
    const encryptIp = config.encryptIP ?? ((ip: string) => ip);
    const hashIpFn = config.hashIp ?? ((ip: string) => ip);
    const isPrivateIPFn = config.isPrivateIP ?? (() => false);

    const fingerprintHash = await Promise.resolve(hashFp(fingerprintId));
    const encryptedIp = encryptIp(rawIp);
    const hashedIp = hashIpFn(rawIp);

    
    const userAgent = ctx.headers.get('user-agent') || 'unknown';
    const deviceType = classifyDevice(userAgent);
    const parsedUA = parseUserAgent(userAgent);

    
    span.setAttribute('device.type', deviceType);
    if (ctx.session?.id) span.setAttribute('session.id', ctx.session.id);
    if (ctx.session?.userId) span.setAttribute('user.id', ctx.session.userId);
    span.setAttribute('ip.hash', hashedIp);
    const ipType = rawIp === 'unknown' ? 'unknown' : isPrivateIPFn(rawIp) ? 'private' : 'public';
    span.setAttribute('ip.type', ipType);
    span.setAttribute('browser.name', parsedUA.browser_name || 'unknown');
    span.setAttribute('browser.version', parsedUA.browser_version || 'unknown');
    if (parsedUA.browser_major_version) {
      span.setAttribute('browser.major_version', parsedUA.browser_major_version);
    }
    span.setAttribute('os.name', parsedUA.os || 'unknown');
    span.setAttribute('os.version', parsedUA.os_version || 'unknown');
    span.setAttribute('engine.name', parsedUA.engine || 'unknown');
    span.setAttribute('engine.version', parsedUA.engine_version || 'unknown');

    
    const referrer = ctx.headers.get('referer') || null;
    const currentUrl = ctx.url;
    let pathname = '/';
    let hostname = 'unknown';
    try {
      const url = new URL(currentUrl);
      pathname = url.pathname;
      hostname = url.hostname;
    } catch {
      
    }

    span.setAttribute('navigation.pathname', pathname);
    span.setAttribute('navigation.hostname', hostname);
    span.setAttribute('navigation.current_url', currentUrl);
    if (referrer) {
      span.setAttribute('navigation.referrer', referrer);
      try {
        const referrerUrl = new URL(referrer);
        span.setAttribute('navigation.referrer_hostname', referrerUrl.hostname);
        span.setAttribute('navigation.is_external_referral', referrerUrl.hostname !== hostname);
      } catch {
        
      }
    }

    
    let geoLocation: EnrichedFingerprint['geoLocation'] = null;

    const devLat = ctx.headers.get('x-dev-latitude');
    const devLng = ctx.headers.get('x-dev-longitude');
    const devAccuracy = ctx.headers.get('x-dev-accuracy');

    if (devLat && devLng) {
      const latitude = parseFloat(devLat);
      const longitude = parseFloat(devLng);
      const accuracyRadius = devAccuracy ? parseFloat(devAccuracy) : null;

      span.setAttribute('geo.method', 'browser-geolocation');
      span.setAttribute('geo.latitude', latitude);
      span.setAttribute('geo.longitude', longitude);

      if (config.reverseGeocode) {
        const reverseGeoResult = await config.reverseGeocode(latitude, longitude, {
          fingerprintId,
          sessionId: ctx.session?.id || null
        });

        if (reverseGeoResult) {
          geoLocation = {
            ...reverseGeoResult,
            latitude,
            longitude,
            accuracyRadius,
            source: 'browser-geolocation' as const
          };
          span.setAttribute('geo.city', reverseGeoResult.city || 'unknown');
          span.setAttribute('geo.country', reverseGeoResult.country);
        } else {
          geoLocation = {
            country: 'Unknown',
            countryCode: 'XX',
            city: null,
            latitude,
            longitude,
            timezone: null,
            accuracyRadius,
            source: 'browser-geolocation' as const
          };
        }
      } else {
        geoLocation = {
          country: 'Unknown',
          countryCode: 'XX',
          city: null,
          latitude,
          longitude,
          timezone: null,
          accuracyRadius,
          source: 'browser-geolocation' as const
        };
      }
    } else if (config.isGeoIPAvailable?.() && config.getLocation && rawIp !== 'unknown') {
      span.setAttribute('geo.method', 'maxmind-geoip');
      const location = config.getLocation(rawIp);

      if (location) {
        geoLocation = { ...location, source: 'maxmind-geoip' as const };
        span.setAttribute('geo.city', location.city || 'unknown');
        span.setAttribute('geo.country', location.country);
        span.setAttribute('geo.latitude', location.latitude ?? 0);
        span.setAttribute('geo.longitude', location.longitude ?? 0);
      } else {
        span.setAttribute('geo.lookup_result', 'not_found');
      }
    } else {
      span.setAttribute('geo.lookup_result', 'skipped');
    }

    
    const detectVPNFn = config.detectVPN ?? (async () => ({
      isVPN: false,
      provider: null,
      confidence: 'low' as const,
      method: 'unknown' as const
    }));
    const vpnDetection = await detectVPNFn(rawIp);

    
    const sessionCookiePresent = !!ctx.cookies?.get('session_id');
    const fingerprintCookiePresent = !!ctx.cookies?.get('fp_id');

    
    const userId = ctx.session?.userId || ctx.user?.id || null;
    const userHandle = ctx.user?.username || null;
    const userRole = ctx.user?.role || null;
    const sessionId = ctx.session?.id || null;

    
    let userFlags: EnrichedFingerprint['userFlags'] | undefined;
    if (userId && config.userFlagsFetcher) {
      try {
        userFlags = await config.userFlagsFetcher.getUserFlags(userId);
      } catch (error) {
        logger.error('Failed to fetch user flags', {
          error: error instanceof Error ? error.message : String(error),
          userId
        });
      }
    }

    
    const components = parseDetailedComponents(detailedFingerprint);

    
    let severity: EnrichedFingerprint['severity'] = 'info';
    if (eventType === 'fingerprint_mismatch') {
      severity = 'critical';
    } else if (vpnDetection.isVPN && vpnDetection.confidence === 'high') {
      severity = 'warning';
    }

    
    const enriched: EnrichedFingerprint = {
      fingerprintId,
      fingerprintHash,
      timestamp: new Date().toISOString(),
      sessionId,
      userId,
      userHandle,
      userRole,
      clientIp: rawIp,
      clientIpEncrypted: encryptedIp,
      clientIpMasked: hashedIp,
      geoLocation,
      vpnDetection,
      userAgent,
      deviceType,
      navigation: { referrer, currentUrl, pathname, hostname },
      components,
      cookies: { sessionCookiePresent, fingerprintCookiePresent },
      userFlags,
      eventType,
      severity
    };

    
    if (config.calculateRiskScore) {
      try {
        const riskScore = config.calculateRiskScore(enriched, {
          previousLocation: null, 
          concurrentSessions: undefined
        });

        span.setAttribute('risk.score', riskScore.score);
        span.setAttribute('risk.tier', riskScore.tier);
        span.setAttribute('risk.factor_count', riskScore.factors.length);
        span.setAttribute('risk.recommendation', riskScore.recommendation);

        if (riskScore.tier === 'critical') {
          enriched.severity = 'critical';
        } else if (riskScore.tier === 'high' && enriched.severity !== 'critical') {
          enriched.severity = 'warning';
        }

        enriched.riskScore = riskScore;
      } catch (riskError) {
        logger.warn('Failed to calculate risk score', {
          error: riskError instanceof Error ? riskError.message : String(riskError),
          fingerprint_id: fingerprintId
        });
      }
    }

    
    span.setAttribute('enrichment.severity', enriched.severity);
    span.setAttribute('enrichment.vpn_detected', vpnDetection.isVPN);
    if (enriched.riskScore) {
      span.setAttribute('enrichment.risk_tier', enriched.riskScore.tier);
    }

    
    if (geoLocation) {
      span.setAttribute('geo.country', geoLocation.country);
      span.setAttribute('geo.city', geoLocation.city || 'unknown');
      if (geoLocation.latitude !== undefined && geoLocation.latitude !== null) {
        span.setAttribute('geo.latitude', geoLocation.latitude);
      }
      if (geoLocation.longitude !== undefined && geoLocation.longitude !== null) {
        span.setAttribute('geo.longitude', geoLocation.longitude);
      }
    }

    
    if (consentPreferences?.consent) {
      const { categories, categoriesRecord, timestamp, version, preciseLocation, ageVerified, optionalHandle } = consentPreferences.consent;

      if (categories && categories.length > 0) {
        span.setAttribute('consent.categories', JSON.stringify(categories));
      }
      if (categoriesRecord) {
        if (categoriesRecord.essential !== undefined) span.setAttribute('consent.categories.essential', String(categoriesRecord.essential));
        if (categoriesRecord.preferences !== undefined) span.setAttribute('consent.categories.preferences', String(categoriesRecord.preferences));
        if (categoriesRecord.functional !== undefined) span.setAttribute('consent.categories.functional', String(categoriesRecord.functional));
        if (categoriesRecord.tracking !== undefined) span.setAttribute('consent.categories.tracking', String(categoriesRecord.tracking));
        if (categoriesRecord.performance !== undefined) span.setAttribute('consent.categories.performance', String(categoriesRecord.performance));
      }
      if (timestamp) span.setAttribute('consent.timestamp', timestamp);
      if (version) span.setAttribute('consent.version', version);
      if (preciseLocation !== undefined) span.setAttribute('consent.preciseLocation', String(preciseLocation));
      if (ageVerified !== undefined) span.setAttribute('consent.ageVerified', String(ageVerified));
      if (optionalHandle) span.setAttribute('consent.optionalHandle', optionalHandle);
    }

    if (consentPreferences?.preferences) {
      const { theme, darkMode, a11y, contentPage } = consentPreferences.preferences;
      if (theme !== undefined) span.setAttribute('preferences.theme', theme);
      if (darkMode !== undefined) span.setAttribute('preferences.darkMode', darkMode);
      if (a11y?.reducedMotion !== undefined) span.setAttribute('preferences.a11y.reducedMotion', a11y.reducedMotion);
      if (a11y?.highContrast !== undefined) span.setAttribute('preferences.a11y.highContrast', a11y.highContrast);
      if (a11y?.fontSize) span.setAttribute('preferences.a11y.fontSize', a11y.fontSize);
      if (contentPage?.forceTheme) span.setAttribute('preferences.contentPage.forceTheme', contentPage.forceTheme);
      if (contentPage?.forceDarkMode !== undefined) span.setAttribute('preferences.contentPage.forceDarkMode', contentPage.forceDarkMode);
      if (contentPage?.forceA11y !== undefined) span.setAttribute('preferences.contentPage.forceA11y', contentPage.forceA11y);
    }

    if (options.additionalAttributes) {
      for (const [key, value] of Object.entries(options.additionalAttributes)) {
        span.setAttribute(key, value);
      }
    }

    
    await logEnrichedFingerprint(enriched);

    return enriched;
  }, { kind: 1  });
}




async function logEnrichedFingerprint(enriched: EnrichedFingerprint): Promise<void> {
  const config = getFingerprintConfig();
  const parsedUA = parseUserAgent(enriched.userAgent);

  const stringLogData: Record<string, string> = {
    fingerprint_id: enriched.fingerprintId,
    fingerprint_hash: enriched.fingerprintHash.slice(0, 16),
    session_id: enriched.sessionId ?? '',
    user_id: enriched.userId ?? '',
    user_handle: enriched.userHandle ?? '',
    user_role: enriched.userRole ?? '',
    ip_raw: enriched.clientIp,
    ip_encrypted: enriched.clientIpEncrypted,
    ip_hash: enriched.clientIpMasked,
    geo_country: enriched.geoLocation?.country || '',
    geo_country_code: enriched.geoLocation?.countryCode || '',
    geo_city: enriched.geoLocation?.city || '',
    geo_latitude: enriched.geoLocation?.latitude?.toString() || '',
    geo_longitude: enriched.geoLocation?.longitude?.toString() || '',
    geo_timezone: enriched.geoLocation?.timezone || '',
    geo_source: enriched.geoLocation?.source || 'unknown',
    vpn_detected: enriched.vpnDetection.isVPN?.toString() || '',
    vpn_provider: enriched.vpnDetection.provider || '',
    vpn_confidence: enriched.vpnDetection.confidence?.toString() || '',
    vpn_method: enriched.vpnDetection.method || '',
    user_agent: enriched.userAgent,
    device_type: enriched.deviceType,
    browser_name: parsedUA.browser_name ?? '',
    browser_version: parsedUA.browser_version ?? '',
    browser_major_version: parsedUA.browser_major_version?.toString() || '',
    os: parsedUA.os ?? '',
    os_version: parsedUA.os_version ?? '',
    engine: parsedUA.engine ?? '',
    engine_version: parsedUA.engine_version ?? '',
    referrer: enriched.navigation.referrer || '',
    current_url: enriched.navigation.currentUrl || '',
    pathname: enriched.navigation.pathname || '',
    hostname: enriched.navigation.hostname || '',
    canvas_fingerprint: enriched.components.canvas?.slice(0, 16) || '',
    webgl_fingerprint: enriched.components.webgl?.slice(0, 16) || '',
    screen_resolution: enriched.components.screenResolution || '',
    browser_timezone: enriched.components.timezone || '',
    browser_language: enriched.components.language || '',
    platform: enriched.components.platform || '',
    cookies_enabled: enriched.components.cookiesEnabled?.toString() || '',
    totp_enabled: enriched.userFlags?.totpEnabled?.toString() || '',
    user_active: enriched.userFlags?.isActive?.toString() || '',
    login_count: enriched.userFlags?.loginCount?.toString() || '',
    failed_login_attempts: enriched.userFlags?.failedLoginAttempts?.toString() || '',
    event_type: enriched.eventType,
    severity: enriched.severity,
    component: 'fingerprint-enrichment',
    risk_score: enriched.riskScore?.score?.toString() || '',
    risk_tier: enriched.riskScore?.tier || '',
    risk_factors: enriched.riskScore?.factors?.map(f => f.name).join(', ') || '',
    risk_recommendation: enriched.riskScore?.recommendation || ''
  };

  logger.info('Fingerprint enrichment logged', stringLogData);

  
  if (config.fileLogger) {
    await config.fileLogger.write({
      level: enriched.severity === 'critical' ? 'warn' : 'info',
      message: 'Fingerprint enrichment logged',
      timestamp: Date.now(),
      component: 'fingerprint-enrichment',
      event_type: enriched.eventType,
      ...stringLogData
    });
  }
}




export async function enrichFingerprintOnSessionCreate(
  ctx: FingerprintRequestContext,
  fingerprintId: string,
  detailedFingerprint?: any,
  consentPreferences?: ConsentPreferenceData
): Promise<EnrichedFingerprint> {
  return enrichFingerprint(ctx, fingerprintId, detailedFingerprint, 'session_created', consentPreferences);
}




export async function enrichFingerprintOnValidation(
  ctx: FingerprintRequestContext,
  fingerprintId: string,
  consentPreferences?: ConsentPreferenceData
): Promise<EnrichedFingerprint> {
  return enrichFingerprint(ctx, fingerprintId, undefined, 'session_validated', consentPreferences);
}




export async function enrichFingerprintOnMismatch(
  ctx: FingerprintRequestContext,
  fingerprintId: string,
  expectedHash: string,
  receivedHash: string,
  consentPreferences?: ConsentPreferenceData
): Promise<EnrichedFingerprint> {
  const enriched = await enrichFingerprint(ctx, fingerprintId, undefined, 'fingerprint_mismatch', consentPreferences);

  logger.error('SECURITY ALERT: Fingerprint mismatch detected', {
    fingerprint_id: enriched.fingerprintId,
    session_id: enriched.sessionId ?? '',
    user_id: enriched.userId ?? '',
    expected_hash: expectedHash.slice(0, 16),
    received_hash: receivedHash.slice(0, 16),
    alert_type: 'session_hijacking',
    risk_level: 'critical',
    geo_country: enriched.geoLocation?.country ?? '',
    vpn_detected: enriched.vpnDetection.isVPN ? 'true' : 'false',
    device_type: enriched.deviceType,
    referrer: enriched.navigation.referrer ?? '',
    current_url: enriched.navigation.currentUrl,
    pathname: enriched.navigation.pathname,
  });

  return enriched;
}




export function getEnrichmentServiceHealth() {
  const config = getFingerprintConfig();
  return {
    geoipAvailable: config.isGeoIPAvailable?.() ?? false,
    vpnDetectionEnabled: !!config.detectVPN,
    fingerprintHashingEnabled: !!config.hashFingerprint,
    userFlagsEnabled: !!config.userFlagsFetcher,
    lokiLoggingEnabled: !!config.fileLogger
  };
}
