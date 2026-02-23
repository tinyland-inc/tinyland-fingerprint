import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  isImpossibleTravel,
  FingerprintHistoryService,
} from '../src/services/FingerprintHistoryService.js';
import { resetFingerprintConfig } from '../src/config.js';

describe('FingerprintHistoryService', () => {
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
      resetFingerprintConfig();
      const service = new FingerprintHistoryService();
      expect(service).toBeDefined();
    });

    it('should return empty for stub methods', async () => {
      resetFingerprintConfig();
      const service = new FingerprintHistoryService();

      const changes = await service.analyzeLocationChanges('user-1');
      expect(changes).toEqual([]);

      const fpChanges = await service.detectFingerprintChanges('user-1');
      expect(fpChanges).toEqual([]);

      const summary = await service.getUserActivitySummary('user-1');
      expect(summary).toBeNull();
    });
  });
});
