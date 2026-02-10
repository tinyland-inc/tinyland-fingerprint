import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enrichFingerprint,
  enrichFingerprintOnSessionCreate,
  enrichFingerprintOnMismatch,
  classifyDevice,
  maskIpAddress,
  parseUserAgent,
  getEnrichmentServiceHealth,
  type FingerprintRequestContext,
} from '../src/services/FingerprintEnrichmentService.js';
import { configureFingerprint, resetFingerprintConfig } from '../src/config.js';

function createMockContext(overrides: Partial<FingerprintRequestContext> = {}): FingerprintRequestContext {
  return {
    headers: {
      get: (name: string) => {
        const headers: Record<string, string> = {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'x-forwarded-for': '203.0.113.50',
          ...(overrides as any)._headers,
        };
        return headers[name.toLowerCase()] ?? null;
      },
    },
    url: 'https://example.com/page',
    session: { id: 'session-123', userId: 'user-456' },
    user: { id: 'user-456', username: 'testuser', role: 'member' },
    cookies: { get: (name: string) => name === 'session_id' ? 'sid-123' : undefined },
    ...overrides,
  };
}

describe('FingerprintEnrichmentService', () => {
  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('classifyDevice', () => {
    it('should classify iPhone as mobile', () => {
      expect(classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) like Mac OS X')).toBe('mobile');
    });

    it('should classify iPad as tablet', () => {
      expect(classifyDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    });

    it('should classify Windows as desktop', () => {
      expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    });

    it('should classify Macintosh as desktop', () => {
      expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('desktop');
    });

    it('should classify unknown UA as unknown', () => {
      expect(classifyDevice('UnknownBot/1.0')).toBe('unknown');
    });

    it('should classify Android mobile', () => {
      expect(classifyDevice('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile')).toBe('mobile');
    });

    it('should classify Android tablet', () => {
      expect(classifyDevice('Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36')).toBe('tablet');
    });
  });

  describe('maskIpAddress', () => {
    it('should mask IPv4 address', () => {
      expect(maskIpAddress('192.168.1.100')).toBe('192.168.*.*');
    });

    it('should mask IPv6 address', () => {
      expect(maskIpAddress('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::*');
    });
  });

  describe('parseUserAgent', () => {
    it('should parse Chrome user agent', () => {
      const result = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      expect(result.browser_name).toBe('Chrome');
      expect(result.os).toBe('Windows');
    });

    it('should parse Firefox user agent', () => {
      const result = parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0');
      expect(result.browser_name).toBe('Firefox');
      expect(result.os).toBe('Linux');
    });

    it('should handle empty string', () => {
      const result = parseUserAgent('');
      expect(result.browser_name).toBeNull();
    });
  });

  describe('enrichFingerprint', () => {
    it('should create enriched fingerprint with default config', async () => {
      const ctx = createMockContext();
      const result = await enrichFingerprint(ctx, 'fp-test-123');

      expect(result.fingerprintId).toBe('fp-test-123');
      expect(result.timestamp).toBeTruthy();
      expect(result.deviceType).toBe('desktop');
      expect(result.eventType).toBe('session_validated');
      expect(result.severity).toBe('info');
      expect(result.userId).toBe('user-456');
      expect(result.userHandle).toBe('testuser');
      expect(result.navigation.pathname).toBe('/page');
    });

    it('should use configured hash functions', async () => {
      configureFingerprint({
        hashFingerprint: (fp) => `hashed:${fp}`,
        hashIp: (ip) => `ip-hash:${ip}`,
        encryptIP: (ip) => `encrypted:${ip}`,
      });

      const ctx = createMockContext();
      const result = await enrichFingerprint(ctx, 'fp-123');

      expect(result.fingerprintHash).toBe('hashed:fp-123');
      expect(result.clientIpMasked).toContain('ip-hash:');
      expect(result.clientIpEncrypted).toContain('encrypted:');
    });

    it('should detect VPN when configured', async () => {
      configureFingerprint({
        detectVPN: async () => ({
          isVPN: true,
          provider: 'NordVPN',
          confidence: 'high' as const,
          method: 'asn' as const,
        }),
      });

      const ctx = createMockContext();
      const result = await enrichFingerprint(ctx, 'fp-vpn-test');

      expect(result.vpnDetection.isVPN).toBe(true);
      expect(result.vpnDetection.provider).toBe('NordVPN');
      expect(result.severity).toBe('warning');
    });

    it('should set severity to critical for fingerprint_mismatch', async () => {
      const ctx = createMockContext();
      const result = await enrichFingerprint(ctx, 'fp-mismatch', undefined, 'fingerprint_mismatch');

      expect(result.eventType).toBe('fingerprint_mismatch');
      expect(result.severity).toBe('critical');
    });

    it('should calculate risk score when configured', async () => {
      configureFingerprint({
        calculateRiskScore: () => ({
          score: 75,
          tier: 'high' as const,
          factors: [{ name: 'vpn', score: 30, description: 'VPN detected' }],
          recommendation: 'monitor',
        }),
      });

      const ctx = createMockContext();
      const result = await enrichFingerprint(ctx, 'fp-risky');

      expect(result.riskScore).toBeDefined();
      expect(result.riskScore!.score).toBe(75);
      expect(result.riskScore!.tier).toBe('high');
      expect(result.severity).toBe('warning');
    });

    it('should include cookie presence', async () => {
      const ctx = createMockContext({
        cookies: {
          get: (name: string) => {
            if (name === 'session_id') return 'sid';
            if (name === 'fp_id') return 'fp';
            return undefined;
          }
        }
      });
      const result = await enrichFingerprint(ctx, 'fp-cookies');

      expect(result.cookies.sessionCookiePresent).toBe(true);
      expect(result.cookies.fingerprintCookiePresent).toBe(true);
    });
  });

  describe('enrichFingerprintOnSessionCreate', () => {
    it('should set eventType to session_created', async () => {
      const ctx = createMockContext();
      const result = await enrichFingerprintOnSessionCreate(ctx, 'fp-session');
      expect(result.eventType).toBe('session_created');
    });
  });

  describe('enrichFingerprintOnMismatch', () => {
    it('should log security alert', async () => {
      const ctx = createMockContext();
      const result = await enrichFingerprintOnMismatch(ctx, 'fp-hijack', 'expected-hash', 'received-hash');
      expect(result.eventType).toBe('fingerprint_mismatch');
      expect(result.severity).toBe('critical');
    });
  });

  describe('getEnrichmentServiceHealth', () => {
    it('should return health status with defaults', () => {
      const health = getEnrichmentServiceHealth();
      expect(health.geoipAvailable).toBe(false);
      expect(health.vpnDetectionEnabled).toBe(false);
      expect(health.fingerprintHashingEnabled).toBe(false);
    });

    it('should reflect configured capabilities', () => {
      configureFingerprint({
        detectVPN: async () => ({ isVPN: false, provider: null, confidence: 'low' as const, method: 'unknown' as const }),
        hashFingerprint: (fp) => fp,
        isGeoIPAvailable: () => true,
        userFlagsFetcher: { getUserFlags: async () => undefined },
        fileLogger: { write: async () => {} },
      });

      const health = getEnrichmentServiceHealth();
      expect(health.geoipAvailable).toBe(true);
      expect(health.vpnDetectionEnabled).toBe(true);
      expect(health.fingerprintHashingEnabled).toBe(true);
      expect(health.userFlagsEnabled).toBe(true);
      expect(health.lokiLoggingEnabled).toBe(true);
    });
  });
});
