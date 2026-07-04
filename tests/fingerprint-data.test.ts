import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FINGERPRINT_DATA_PLANE_CONTRACT,
  FingerprintDataService,
  resolveFingerprintDataPlaneAvailability
} from '../src/services/FingerprintDataService.js';
import { configureFingerprint, resetFingerprintConfig } from '../src/config.js';

describe('FingerprintDataService', () => {
  let service: FingerprintDataService;

  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('resolveFingerprintDataPlaneAvailability', () => {
    it('declares Tempo as the primary fingerprint data plane', () => {
      expect(FINGERPRINT_DATA_PLANE_CONTRACT.primarySource).toBe('tempo');
      expect(FINGERPRINT_DATA_PLANE_CONTRACT.recordSourceOrder).toEqual(['tempo', 'loki', 'file']);
      expect(FINGERPRINT_DATA_PLANE_CONTRACT.searchSource).toBe('tempo');
      expect(FINGERPRINT_DATA_PLANE_CONTRACT.historySource).toBe('tempo');
    });

    it('keeps search and history Tempo-only while allowing Loki records fallback', () => {
      const availability = resolveFingerprintDataPlaneAvailability({
        tempoAvailable: false,
        lokiAvailable: true,
        nodeEnv: 'production'
      });

      expect(availability.activeRecordSources).toEqual(['loki']);
      expect(availability.primaryAvailable).toBe(false);
      expect(availability.fallbackAvailable).toBe(true);
      expect(availability.recordsAvailable).toBe(true);
      expect(availability.statsAvailable).toBe(true);
      expect(availability.geoAvailable).toBe(true);
      expect(availability.searchAvailable).toBe(false);
      expect(availability.historyAvailable).toBe(false);
    });

    it('limits local file availability to non-production records fallback', () => {
      expect(resolveFingerprintDataPlaneAvailability({
        tempoAvailable: false,
        lokiAvailable: false,
        localFileAvailable: true,
        nodeEnv: 'production'
      }).recordsAvailable).toBe(false);

      const developmentAvailability = resolveFingerprintDataPlaneAvailability({
        tempoAvailable: false,
        lokiAvailable: false,
        localFileAvailable: true,
        nodeEnv: 'development'
      });

      expect(developmentAvailability.activeRecordSources).toEqual(['file']);
      expect(developmentAvailability.recordsAvailable).toBe(true);
      expect(developmentAvailability.searchAvailable).toBe(false);
      expect(developmentAvailability.historyAvailable).toBe(false);
    });
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

  describe('getFingerprintRecordsForUser', () => {
    it('should use targeted Tempo filters for resolved user identifiers', async () => {
      const mockTempoService = {
        queryFingerprints: vi.fn().mockImplementation((_timeRange: string, tags: Record<string, string>) => {
          if (tags['user.id'] === 'user-1') {
            return Promise.resolve([
              {
                timestamp: '2026-04-22T10:00:00Z',
                fingerprintId: 'fp-id',
                fingerprintHash: 'hash-id',
                userId: 'user-1',
                eventType: 'pageview',
                vpnDetected: false,
              }
            ]);
          }

          if (tags['user.handle'] === 'alice') {
            return Promise.resolve([
              {
                timestamp: '2026-04-22T11:00:00Z',
                fingerprintId: 'fp-handle',
                fingerprintHash: 'hash-handle',
                userHandle: 'alice',
                eventType: 'pageview',
                vpnDetected: false,
              }
            ]);
          }

          return Promise.resolve([]);
        }),
        searchTraces: vi.fn(),
        getTagValueSuggestions: vi.fn(),
      };

      configureFingerprint({ tempoQueryService: mockTempoService });
      service = new FingerprintDataService();

      const records = await service.getFingerprintRecordsForUser(
        { userId: 'user-1', userHandle: 'alice' },
        '7d',
        10
      );

      expect(records).toHaveLength(2);
      expect(records.map((record) => record.fingerprintId)).toEqual(['fp-handle', 'fp-id']);
      expect(mockTempoService.queryFingerprints).toHaveBeenCalledWith('7d', { 'user.id': 'user-1' }, 10);
      expect(mockTempoService.queryFingerprints).toHaveBeenCalledWith('7d', { 'user.handle': 'alice' }, 10);
    });

    it('should use targeted Loki filters when Tempo is unavailable', async () => {
      const fetchLoki = vi.fn().mockImplementation((path: string) => {
        const decodedPath = decodeURIComponent(path);

        if (decodedPath.includes('user_id="user-1"')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              data: {
                result: [
                  {
                    values: [
                      [
                        '1713780000000000000',
                        JSON.stringify({
                          fingerprint_id: 'fp-id',
                          fingerprint_hash: 'hash-id',
                          user_id: 'user-1',
                          session_id: 'session-1',
                          event_type: 'pageview',
                          vpn_detected: false,
                        })
                      ]
                    ]
                  }
                ]
              }
            })
          });
        }

        if (decodedPath.includes('user_handle="alice"')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              data: {
                result: [
                  {
                    values: [
                      [
                        '1713783600000000000',
                        JSON.stringify({
                          fingerprint_id: 'fp-handle',
                          fingerprint_hash: 'hash-handle',
                          user_handle: 'alice',
                          session_id: 'session-2',
                          event_type: 'pageview',
                          vpn_detected: false,
                        })
                      ]
                    ]
                  }
                ]
              }
            })
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ data: { result: [] } })
        });
      });

      configureFingerprint({
        nodeEnv: 'production',
        observabilityFetcher: { fetchLoki },
      });
      service = new FingerprintDataService();

      const records = await service.getFingerprintRecordsForUser(
        { userId: 'user-1', userHandle: 'alice' },
        '7d',
        10
      );

      expect(records).toHaveLength(2);
      expect(records.map((record) => record.fingerprintId)).toEqual(['fp-handle', 'fp-id']);
      expect(fetchLoki).toHaveBeenCalledTimes(2);
      expect(decodeURIComponent(fetchLoki.mock.calls[0][0])).toContain('user_id="user-1"');
      expect(decodeURIComponent(fetchLoki.mock.calls[1][0])).toContain('user_handle="alice"');
    });
  });

  describe('getTempoFingerprintRecordsForUser', () => {
    it('should return targeted Tempo records without widening to fallback sources', async () => {
      const mockTempoService = {
        queryFingerprints: vi.fn().mockResolvedValue([
          {
            timestamp: '2026-04-22T10:00:00Z',
            fingerprintId: 'fp-id',
            fingerprintHash: 'hash-id',
            userId: 'user-1',
            eventType: 'pageview',
            vpnDetected: false,
          }
        ]),
        searchTraces: vi.fn(),
        getTagValueSuggestions: vi.fn(),
      };

      const fetchLoki = vi.fn();

      configureFingerprint({
        tempoQueryService: mockTempoService,
        observabilityFetcher: { fetchLoki },
      });
      service = new FingerprintDataService();

      const records = await service.getTempoFingerprintRecordsForUser({ userId: 'user-1' }, '7d', 10);

      expect(records).toHaveLength(1);
      expect(records[0].fingerprintId).toBe('fp-id');
      expect(fetchLoki).not.toHaveBeenCalled();
    });

    it('should return empty when Tempo is unavailable', async () => {
      const fetchLoki = vi.fn();
      configureFingerprint({
        nodeEnv: 'production',
        observabilityFetcher: { fetchLoki },
      });
      service = new FingerprintDataService();

      const records = await service.getTempoFingerprintRecordsForUser({ userId: 'user-1' }, '7d', 10);

      expect(records).toEqual([]);
      expect(fetchLoki).not.toHaveBeenCalled();
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
