import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  wasRecentlyLogged,
  markAsLogged,
  getCacheStats,
  invalidateFingerprint,
  clearCache,
} from '../src/cache.js';
import { resetFingerprintConfig } from '../src/config.js';

describe('FingerprintCache', () => {
  beforeEach(() => {
    clearCache();
    resetFingerprintConfig();
  });

  afterEach(() => {
    clearCache();
  });

  describe('wasRecentlyLogged', () => {
    it('should return false for unknown fingerprint', () => {
      expect(wasRecentlyLogged('fp-unknown', 'session-1')).toBe(false);
    });

    it('should return true after marking as logged', () => {
      markAsLogged('fp-1', 'session-1');
      expect(wasRecentlyLogged('fp-1', 'session-1')).toBe(true);
    });

    it('should differentiate by session ID', () => {
      markAsLogged('fp-1', 'session-1');
      expect(wasRecentlyLogged('fp-1', 'session-1')).toBe(true);
      expect(wasRecentlyLogged('fp-1', 'session-2')).toBe(false);
    });

    it('should differentiate by fingerprint ID', () => {
      markAsLogged('fp-1', 'session-1');
      expect(wasRecentlyLogged('fp-1', 'session-1')).toBe(true);
      expect(wasRecentlyLogged('fp-2', 'session-1')).toBe(false);
    });

    it('should use anonymous as default session ID', () => {
      markAsLogged('fp-1');
      expect(wasRecentlyLogged('fp-1')).toBe(true);
      expect(wasRecentlyLogged('fp-1', 'anonymous')).toBe(true);
    });
  });

  describe('markAsLogged', () => {
    it('should update cache stats', () => {
      expect(getCacheStats().size).toBe(0);
      markAsLogged('fp-1', 'session-1');
      expect(getCacheStats().size).toBe(1);
      markAsLogged('fp-2', 'session-2');
      expect(getCacheStats().size).toBe(2);
    });

    it('should update timestamp on re-mark', () => {
      markAsLogged('fp-1', 'session-1');
      const firstCheck = wasRecentlyLogged('fp-1', 'session-1');
      expect(firstCheck).toBe(true);

      
      markAsLogged('fp-1', 'session-1');
      expect(getCacheStats().size).toBe(1);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct stats', () => {
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.ttlHours).toBe(6);
      expect(stats.cleanupIntervalMinutes).toBe(30);
      expect(stats.maxSize).toBe(10000);
    });
  });

  describe('invalidateFingerprint', () => {
    it('should remove all entries for a fingerprint', () => {
      markAsLogged('fp-1', 'session-1');
      markAsLogged('fp-1', 'session-2');
      markAsLogged('fp-2', 'session-1');

      expect(getCacheStats().size).toBe(3);

      invalidateFingerprint('fp-1');

      expect(getCacheStats().size).toBe(1);
      expect(wasRecentlyLogged('fp-1', 'session-1')).toBe(false);
      expect(wasRecentlyLogged('fp-1', 'session-2')).toBe(false);
      expect(wasRecentlyLogged('fp-2', 'session-1')).toBe(true);
    });

    it('should do nothing for unknown fingerprint', () => {
      markAsLogged('fp-1', 'session-1');
      invalidateFingerprint('fp-unknown');
      expect(getCacheStats().size).toBe(1);
    });
  });

  describe('clearCache', () => {
    it('should remove all entries', () => {
      markAsLogged('fp-1', 'session-1');
      markAsLogged('fp-2', 'session-2');
      expect(getCacheStats().size).toBe(2);

      clearCache();
      expect(getCacheStats().size).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      
      vi.useFakeTimers();

      markAsLogged('fp-1', 'session-1');
      expect(wasRecentlyLogged('fp-1', 'session-1')).toBe(true);

      
      vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 60 * 1000);

      expect(wasRecentlyLogged('fp-1', 'session-1')).toBe(false);

      vi.useRealTimers();
    });
  });
});
