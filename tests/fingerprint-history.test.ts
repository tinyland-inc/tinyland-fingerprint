import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateDistance,
  isImpossibleTravel,
  FingerprintHistoryService,
} from '../src/services/FingerprintHistoryService.js';
import { configureFingerprint, resetFingerprintConfig } from '../src/config.js';

describe('FingerprintHistoryService', () => {
  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two known cities', () => {
      
      const distance = calculateDistance(40.7128, -74.006, 34.0522, -118.2437);
      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    it('should return 0 for same point', () => {
      const distance = calculateDistance(42.4406, -76.4966, 42.4406, -76.4966);
      expect(distance).toBe(0);
    });

    it('should calculate distance across continents', () => {
      
      const distance = calculateDistance(51.5074, -0.1278, 35.6762, 139.6503);
      expect(distance).toBeGreaterThan(9500);
      expect(distance).toBeLessThan(9700);
    });

    it('should handle negative coordinates', () => {
      
      const distance = calculateDistance(-33.8688, 151.2093, -34.6037, -58.3816);
      expect(distance).toBeGreaterThan(11500);
      expect(distance).toBeLessThan(12100);
    });
  });

  describe('isImpossibleTravel', () => {
    it('should not flag nearby locations', () => {
      const result = isImpossibleTravel(30, 30 * 60 * 1000); 
      expect(result.impossible).toBe(false);
    });

    it('should flag impossible speed over short window', () => {
      
      const result = isImpossibleTravel(1000, 30 * 60 * 1000);
      expect(result.impossible).toBe(true);
      expect(result.reason).toContain('exceeds ground transport speed');
    });

    it('should flag supersonic travel over long window', () => {
      
      const result = isImpossibleTravel(5000, 2 * 60 * 60 * 1000);
      expect(result.impossible).toBe(true);
      expect(result.reason).toContain('exceeds commercial aircraft speed');
    });

    it('should allow normal air travel', () => {
      
      const result = isImpossibleTravel(3000, 5 * 60 * 60 * 1000);
      expect(result.impossible).toBe(false);
    });

    it('should allow car travel speeds for short time', () => {
      
      const result = isImpossibleTravel(100, 30 * 60 * 1000);
      expect(result.impossible).toBe(false);
    });
  });

  describe('FingerprintHistoryService class', () => {
    it('should instantiate without errors', () => {
      const service = new FingerprintHistoryService();
      expect(service).toBeDefined();
    });

    it('should return empty summaries when no records exist', async () => {
      const service = new FingerprintHistoryService();

      const changes = await service.analyzeLocationChanges('user-1');
      expect(changes).toEqual([]);

      const fpChanges = await service.detectFingerprintChanges('user-1');
      expect(fpChanges).toEqual([]);

      const summary = await service.getUserActivitySummary('user-1');
      expect(summary).toBeNull();
    });

    it('should treat history as Tempo-owned for admin/security analysis', async () => {
      configureFingerprint({
        nodeEnv: 'production',
        observabilityFetcher: {
          fetchLoki: vi.fn(),
        },
      });

      const service = new FingerprintHistoryService();
      const history = await service.getRecentHistory({ userId: 'user-1', userHandle: 'alice' }, 10, 24);

      expect(history).toEqual([]);
    });

    it('should derive user history through the shared fingerprint data surface', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-04-22T12:00:00Z',
              fingerprintId: 'fp-2',
              fingerprintHash: 'hash-2',
              userId: 'user-1',
              sessionId: 'session-2',
              geoCountry: 'Canada',
              geoCity: 'Toronto',
              geoLatitude: 43.6532,
              geoLongitude: -79.3832,
              vpnDetected: true,
              deviceType: 'desktop',
              userAgent: 'Firefox/124.0',
              eventType: 'pageview',
            },
            {
              timestamp: '2026-04-22T10:00:00Z',
              fingerprintId: 'fp-1',
              fingerprintHash: 'hash-1',
              userHandle: 'user-1',
              sessionId: 'session-1',
              geoCountry: 'United States',
              geoCity: 'Ithaca',
              geoLatitude: 42.4406,
              geoLongitude: -76.4966,
              vpnDetected: false,
              deviceType: 'desktop',
              userAgent: 'Firefox/123.0',
              eventType: 'pageview',
            },
            {
              timestamp: '2026-04-22T11:00:00Z',
              fingerprintId: 'fp-other',
              fingerprintHash: 'hash-other',
              userId: 'user-2',
              sessionId: 'session-other',
              geoCountry: 'France',
              geoCity: 'Paris',
              geoLatitude: 48.8566,
              geoLongitude: 2.3522,
              vpnDetected: false,
              deviceType: 'mobile',
              userAgent: 'Safari/17.0',
              eventType: 'pageview',
            },
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const service = new FingerprintHistoryService();
      const history = await service.getRecentHistory(
        { userId: 'user-1', userHandle: 'user-1' },
        10,
        24
      );

      expect(history).toHaveLength(2);
      expect(history[0].fingerprintId).toBe('fp-2');
      expect(history[1].fingerprintId).toBe('fp-1');
      expect(history[0].location?.country).toBe('Canada');
    });

    it('should analyze location changes and impossible travel', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-04-22T10:00:00Z',
              fingerprintId: 'fp-1',
              fingerprintHash: 'hash-1',
              userId: 'user-1',
              geoCountry: 'United States',
              geoCity: 'New York',
              geoLatitude: 40.7128,
              geoLongitude: -74.006,
              vpnDetected: false,
              deviceType: 'desktop',
              userAgent: 'Firefox/123.0',
              eventType: 'pageview',
            },
            {
              timestamp: '2026-04-22T11:00:00Z',
              fingerprintId: 'fp-2',
              fingerprintHash: 'hash-2',
              userId: 'user-1',
              geoCountry: 'Japan',
              geoCity: 'Tokyo',
              geoLatitude: 35.6762,
              geoLongitude: 139.6503,
              vpnDetected: false,
              deviceType: 'desktop',
              userAgent: 'Firefox/123.0',
              eventType: 'pageview',
            },
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const service = new FingerprintHistoryService();
      const changes = await service.analyzeLocationChanges('user-1', 24);

      expect(changes).toHaveLength(1);
      expect(changes[0].isImpossible).toBe(true);
      expect(changes[0].distanceKm).toBeGreaterThan(10000);
    });

    it('should derive change and activity summaries from history records', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-04-22T09:00:00Z',
              fingerprintId: 'fp-1',
              fingerprintHash: 'hash-1',
              userId: 'user-1',
              geoCountry: 'United States',
              geoCity: 'Ithaca',
              geoLatitude: 42.4406,
              geoLongitude: -76.4966,
              vpnDetected: false,
              deviceType: 'desktop',
              userAgent: 'Firefox/123.0',
              eventType: 'pageview',
            },
            {
              timestamp: '2026-04-22T10:00:00Z',
              fingerprintId: 'fp-2',
              fingerprintHash: 'hash-2',
              userId: 'user-1',
              geoCountry: 'United States',
              geoCity: 'Ithaca',
              geoLatitude: 42.4406,
              geoLongitude: -76.4966,
              vpnDetected: true,
              deviceType: 'mobile',
              userAgent: 'Firefox/124.0',
              eventType: 'pageview',
            },
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const service = new FingerprintHistoryService();

      const fingerprintChanges = await service.detectFingerprintChanges('user-1', 24);
      expect(fingerprintChanges).toHaveLength(1);
      expect(fingerprintChanges[0].changeType).toBe('vpn_toggle');

      const summary = await service.getUserActivitySummary('user-1', 24);
      expect(summary).not.toBeNull();
      expect(summary?.totalEvents).toBe(2);
      expect(summary?.uniqueDevices).toBe(2);
      expect(summary?.uniqueFingerprints).toBe(2);
      expect(summary?.vpnPercentage).toBe(50);
    });

    it('should package investigation snapshots with explicit source model metadata', async () => {
      configureFingerprint({
        tempoQueryService: {
          queryFingerprints: vi.fn().mockResolvedValue([
            {
              timestamp: '2026-04-22T09:00:00Z',
              fingerprintId: 'fp-1',
              fingerprintHash: 'hash-1',
              userId: 'user-1',
              geoCountry: 'United States',
              geoCity: 'Ithaca',
              geoLatitude: 42.4406,
              geoLongitude: -76.4966,
              vpnDetected: false,
              deviceType: 'desktop',
              userAgent: 'Firefox/123.0',
              eventType: 'pageview',
            }
          ]),
          searchTraces: vi.fn(),
          getTagValueSuggestions: vi.fn(),
        },
      });

      const service = new FingerprintHistoryService();
      const investigation = await service.getSecurityInvestigation(
        { userId: 'user-1', userHandle: 'alice' },
        {
          recentHistoryLimit: 10,
          recentHistoryHours: 24,
          extendedHistoryLimit: 20,
          extendedHistoryHours: 72
        }
      );

      expect(investigation.sourceModel).toBe('derived_enrichment_history');
      expect(investigation.signals).toEqual([]);
      expect(investigation.recentHistory).toHaveLength(1);
      expect(investigation.extendedHistory).toHaveLength(1);
      expect(investigation.activitySummary?.totalEvents).toBe(1);
    });

    it('should derive package-owned security signals from heuristic thresholds', () => {
      const service = new FingerprintHistoryService();
      const signals = service.deriveSecuritySignals(
        {
          totalEvents: 6,
          uniqueDevices: 3,
          uniqueLocations: 2,
          uniqueFingerprints: 6,
          vpnPercentage: 83,
          impossibleTravelIncidents: 1,
          fingerprintChanges: 6,
          suspiciousActivityScore: 85
        },
        [
          {
            from: {
              country: 'United States',
              city: 'Ithaca',
              latitude: 42.4406,
              longitude: -76.4966,
              timestamp: '2026-04-22T09:00:00Z'
            },
            to: {
              country: 'Japan',
              city: 'Tokyo',
              latitude: 35.6762,
              longitude: 139.6503,
              timestamp: '2026-04-22T10:00:00Z'
            },
            distanceKm: 10000,
            timeElapsedMs: 3600000,
            isImpossible: true,
            reason: 'Impossible travel'
          }
        ],
        new Array(6).fill(null).map((_, index) => ({
          timestamp: `2026-04-22T1${index}:00:00Z`,
          changeType: 'fingerprint_change' as const,
          oldFingerprint: `old-${index}`,
          newFingerprint: `new-${index}`,
          details: 'Fingerprint changed'
        }))
      );

      expect(signals.map((signal) => signal.kind)).toEqual([
        'impossible_travel',
        'fingerprint_churn',
        'vpn_prevalence'
      ]);
    });
  });
});
