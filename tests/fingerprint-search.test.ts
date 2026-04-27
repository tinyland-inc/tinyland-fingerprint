import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FingerprintSearchService } from '../src/services/FingerprintSearchService.js';
import { configureFingerprint, resetFingerprintConfig } from '../src/config.js';

describe('FingerprintSearchService', () => {
  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('buildTraceQLQuery', () => {
    it('should build query with name filter only when no filters', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({});
      expect(query).toBe('{ name="fingerprint.enrichment" }');
    });

    it('should add VPN filter', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ vpnDetected: true });
      expect(query).toContain('span.vpn.detected = true');
    });

    it('should add country filter (exact)', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ geoCountry: 'United States' });
      expect(query).toContain('span.geo.country = "United States"');
    });

    it('should add country filter (wildcard)', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ geoCountry: 'United*' });
      expect(query).toContain('span.geo.country =~ "(?i)United.*"');
    });

    it('should add risk score range filter', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ riskScoreMin: 50, riskScoreMax: 80 });
      expect(query).toContain('span.risk.score >= 50 && span.risk.score <= 80');
    });

    it('should use exact match for equal min/max risk score', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ riskScoreMin: 50, riskScoreMax: 50 });
      expect(query).toContain('span.risk.score = 50');
    });

    it('should add browser filter with wildcard', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ browserName: 'Chrome*' });
      expect(query).toContain('span.browser.name =~ "(?i)Chrome.*"');
    });

    it('should add device type filter', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ deviceType: 'mobile' });
      expect(query).toContain('span.device.type = "mobile"');
    });

    it('should add user ID filter', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({ userId: 'user-123' });
      expect(query).toContain('span.user.id = "user-123"');
    });

    it('should combine multiple filters with &&', () => {
      const service = new FingerprintSearchService();
      const query = service.buildTraceQLQuery({
        vpnDetected: true,
        geoCountry: 'Germany',
        riskScoreMin: 60,
      });
      expect(query).toContain('name="fingerprint.enrichment"');
      expect(query).toContain('span.vpn.detected = true');
      expect(query).toContain('span.geo.country = "Germany"');
      expect(query).toContain('span.risk.score >= 60');
      
      const andCount = (query.match(/&&/g) || []).length;
      expect(andCount).toBe(3); 
    });
  });

  describe('wildcardToRegex', () => {
    it('should convert * to .*', () => {
      const service = new FingerprintSearchService();
      expect(service.wildcardToRegex('Nord*')).toBe('(?i)Nord.*');
    });

    it('should convert ? to .', () => {
      const service = new FingerprintSearchService();
      expect(service.wildcardToRegex('Windows 1?')).toBe('(?i)Windows 1.');
    });

    it('should escape regex special characters', () => {
      const service = new FingerprintSearchService();
      expect(service.wildcardToRegex('test.value*')).toBe('(?i)test\\.value.*');
    });
  });

  describe('parseTimeWindow', () => {
    it('should parse hours', () => {
      const service = new FingerprintSearchService();
      const result = service.parseTimeWindow('24h');
      const diff = result.end - result.start;
      expect(diff).toBeCloseTo(24 * 60 * 60, -1); 
    });

    it('should parse days', () => {
      const service = new FingerprintSearchService();
      const result = service.parseTimeWindow('7d');
      const diff = result.end - result.start;
      expect(diff).toBeCloseTo(7 * 24 * 60 * 60, -1);
    });

    it('should parse weeks', () => {
      const service = new FingerprintSearchService();
      const result = service.parseTimeWindow('2w');
      const diff = result.end - result.start;
      expect(diff).toBeCloseTo(14 * 24 * 60 * 60, -1);
    });

    it('should default to 7d for invalid format', () => {
      const service = new FingerprintSearchService();
      const result = service.parseTimeWindow('invalid');
      const diff = result.end - result.start;
      expect(diff).toBeCloseTo(7 * 24 * 60 * 60, -1);
    });
  });

  describe('search', () => {
    it('should return empty results when tempo service not configured', async () => {
      const service = new FingerprintSearchService();
      const results = await service.search({});
      expect(results.results).toEqual([]);
      expect(results.totalResults).toBe(0);
      expect(results.dataSource).toBe('none');
    });

    it('should return results from Tempo', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn(),
          searchTraces: vi.fn().mockResolvedValue([]),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const service = new FingerprintSearchService();
      const results = await service.search({});
      expect(results.dataSource).toBe('tempo');
      expect(results.results).toEqual([]);
      expect(results.totalResults).toBe(0);
    });
  });

  describe('quickSearch', () => {
    it('should return empty for short queries', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn(),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const service = new FingerprintSearchService();
      const results = await service.quickSearch('a', 'all');
      expect(results).toEqual([]);
    });

    it('should return fingerprint suggestions', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn(),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn().mockResolvedValue(['fp-abc123', 'fp-abc456']),
        },
      });

      const service = new FingerprintSearchService();
      const results = await service.quickSearch('abc', 'fingerprint');
      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('fingerprint');
      expect(results[0].id).toBe('fp-abc123');
    });
  });
});
