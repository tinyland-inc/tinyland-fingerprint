import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FingerprintDataService } from '../src/services/FingerprintDataService.js';
import { configureFingerprint, resetFingerprintConfig } from '../src/config.js';

describe('FingerprintDataService', () => {
  let service: FingerprintDataService;

  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('parseTimeRange', () => {
    it('should parse seconds', () => {
      service = new FingerprintDataService();
      expect(service.parseTimeRange('30s')).toBe(30 * 1000);
    });

    it('should parse minutes', () => {
      service = new FingerprintDataService();
      expect(service.parseTimeRange('5m')).toBe(5 * 60 * 1000);
    });

    it('should parse hours', () => {
      service = new FingerprintDataService();
      expect(service.parseTimeRange('1h')).toBe(60 * 60 * 1000);
    });

    it('should parse days', () => {
      service = new FingerprintDataService();
      expect(service.parseTimeRange('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should default to 7d for invalid format', () => {
      service = new FingerprintDataService();
      expect(service.parseTimeRange('invalid')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('parseBrowserName', () => {
    it('should detect Chrome', () => {
      service = new FingerprintDataService();
      expect(service.parseBrowserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'))
        .toBe('Chrome');
    });

    it('should detect Firefox', () => {
      service = new FingerprintDataService();
      expect(service.parseBrowserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Firefox/121.0'))
        .toBe('Firefox');
    });

    it('should detect Edge', () => {
      service = new FingerprintDataService();
      expect(service.parseBrowserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'))
        .toBe('Edge');
    });

    it('should detect Safari', () => {
      service = new FingerprintDataService();
      expect(service.parseBrowserName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'))
        .toBe('Safari');
    });

    it('should return Unknown for empty/undefined', () => {
      service = new FingerprintDataService();
      expect(service.parseBrowserName(undefined)).toBe('Unknown');
      expect(service.parseBrowserName('')).toBe('Unknown');
    });
  });

  describe('parseOperatingSystem', () => {
    it('should detect Windows 10', () => {
      service = new FingerprintDataService();
      expect(service.parseOperatingSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'))
        .toBe('Windows 10');
    });

    it('should detect macOS', () => {
      service = new FingerprintDataService();
      expect(service.parseOperatingSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'))
        .toBe('macOS Catalina');
    });

    it('should detect Linux', () => {
      service = new FingerprintDataService();
      expect(service.parseOperatingSystem('Mozilla/5.0 (X11; Linux x86_64)'))
        .toBe('Linux');
    });

    it('should detect Android', () => {
      service = new FingerprintDataService();
      expect(service.parseOperatingSystem('Mozilla/5.0 (Linux; Android 13)'))
        .toBe('Android');
    });

    it('should detect iOS', () => {
      service = new FingerprintDataService();
      expect(service.parseOperatingSystem('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'))
        .toBe('iOS');
    });
  });

  describe('getFingerprintRecords (with Tempo)', () => {
    it('should use Tempo as primary source', async () => {
      const mockTempoService = {
        queryFingerprints: vi.fn().mockResolvedValue([
          {
            timestamp: '2026-01-15T10:00:00Z',
            fingerprintId: 'fp-123',
            fingerprintHash: 'hash-123',
            vpnDetected: false,
            eventType: 'session_validated',
            geoCountry: 'United States',
          }
        ]),
        searchTraces: vi.fn(),
        getTagValueSuggestions: vi.fn(),
      };

      configureFingerprint({ tempoQueryService: mockTempoService });
      service = new FingerprintDataService();

      const records = await service.getFingerprintRecords('7d', 100);
      expect(records).toHaveLength(1);
      expect(records[0].fingerprintId).toBe('fp-123');
      expect(mockTempoService.queryFingerprints).toHaveBeenCalledWith('7d', {}, 100);
    });

    it('should return empty array when no data sources available', async () => {
      configureFingerprint({ nodeEnv: 'production' });
      service = new FingerprintDataService();
      const records = await service.getFingerprintRecords('7d');
      expect(records).toEqual([]);
    });
  });

  describe('getFingerprintStats', () => {
    it('should return zero stats when no data available', async () => {
      configureFingerprint({ nodeEnv: 'production' });
      service = new FingerprintDataService();
      const stats = await service.getFingerprintStats('7d');

      expect(stats.totalFingerprints).toBe(0);
      expect(stats.vpnUsers).toBe(0);
      expect(stats.vpnPercentage).toBe(0);
      expect(stats.highRiskCount).toBe(0);
      expect(stats.uniqueCountries).toBe(0);
      expect(stats.byCountry).toEqual([]);
      expect(stats.byDevice).toEqual([]);
    });
  });

  describe('getFingerprintGeoData', () => {
    it('should return empty geo data when no records', async () => {
      configureFingerprint({ nodeEnv: 'production' });
      service = new FingerprintDataService();
      const geoData = await service.getFingerprintGeoData('7d');

      expect(geoData.markers).toEqual([]);
      expect(geoData.locationCounts).toEqual([]);
      expect(geoData.totalFingerprints).toBe(0);
      expect(geoData.vpnPercentage).toBe(0);
      expect(geoData.highRiskCount).toBe(0);
    });
  });
});
