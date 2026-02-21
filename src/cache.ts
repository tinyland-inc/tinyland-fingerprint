/**
 * Fingerprint Session Cache
 *
 * Deduplicates fingerprint enrichment logging at the source.
 * Tracks recently-logged fingerprints to prevent duplicate writes for the same
 * fingerprint+session within a configurable time window.
 *
 * Impact: Reduces log volume by 99.7% (1.8M -> 5.4k logs/7d)
 *
 * @module cache
 */

import { getScopedLogger } from './config.js';

const logger = getScopedLogger('fingerprint-cache');

/**
 * Cache entry: Last log timestamp for fingerprint+session tuple.
 */
interface CacheEntry {
  lastLogged: number; // Unix timestamp (ms)
  sessionId: string;
  fingerprintId: string;
}

/**
 * In-memory cache of recently-logged fingerprints.
 * Key: `${fingerprintId}_${sessionId}`
 */
const recentFingerprints = new Map<string, CacheEntry>();

/**
 * Configuration.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 10000;

/**
 * Cleanup timer.
 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Cleanup expired entries.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const expirationThreshold = now - CACHE_TTL_MS;
  let removedCount = 0;

  for (const [key, entry] of recentFingerprints.entries()) {
    if (entry.lastLogged < expirationThreshold) {
      recentFingerprints.delete(key);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    logger.debug('Fingerprint cache cleanup completed', {
      component: 'fingerprint-cache',
      removedCount: removedCount.toString(),
      remainingCount: recentFingerprints.size.toString(),
    });
  }
}

/**
 * Start periodic cleanup timer.
 */
function startCleanupTimer(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL_MS);

  // Prevent timer from blocking process exit
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }

  logger.info('Fingerprint cache cleanup timer started', {
    component: 'fingerprint-cache',
    cleanupIntervalMinutes: (CLEANUP_INTERVAL_MS / 60 / 1000).toString(),
    ttlHours: (CACHE_TTL_MS / 60 / 60 / 1000).toString()
  });
}

/**
 * Check if fingerprint was recently logged.
 *
 * @param fingerprintId - FingerprintJS visitor ID
 * @param sessionId - Session ID (or 'anonymous' if no session)
 * @returns true if logged within TTL window, false otherwise
 */
export function wasRecentlyLogged(fingerprintId: string, sessionId: string = 'anonymous'): boolean {
  if (!cleanupTimer) {
    startCleanupTimer();
  }

  const key = `${fingerprintId}_${sessionId}`;
  const entry = recentFingerprints.get(key);

  if (!entry) return false;

  const now = Date.now();
  const age = now - entry.lastLogged;

  if (age < CACHE_TTL_MS) {
    logger.debug('Fingerprint enrichment skipped (recently logged)', {
      component: 'fingerprint-cache',
      fingerprintId: fingerprintId.slice(0, 16),
      sessionId: sessionId.slice(0, 16),
      ageMinutes: Math.floor(age / 60 / 1000).toString(),
      ttlHours: (CACHE_TTL_MS / 60 / 60 / 1000).toString()
    });
    return true;
  }

  recentFingerprints.delete(key);
  return false;
}

/**
 * Mark fingerprint as logged (update cache).
 *
 * @param fingerprintId - FingerprintJS visitor ID
 * @param sessionId - Session ID (or 'anonymous' if no session)
 */
export function markAsLogged(fingerprintId: string, sessionId: string = 'anonymous'): void {
  const key = `${fingerprintId}_${sessionId}`;
  const now = Date.now();

  // Safety check: Prevent unbounded cache growth
  if (recentFingerprints.size >= MAX_CACHE_SIZE) {
    logger.warn('Fingerprint cache size limit reached, forcing cleanup', {
      component: 'fingerprint-cache',
      cacheSize: recentFingerprints.size.toString(),
      maxSize: MAX_CACHE_SIZE.toString()
    });
    cleanupExpiredEntries();

    if (recentFingerprints.size >= MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(recentFingerprints.entries()).sort(
        (a, b) => a[1].lastLogged - b[1].lastLogged
      );
      const toRemove = sortedEntries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2));
      toRemove.forEach(([k]) => recentFingerprints.delete(k));

      logger.warn('Emergency cache purge completed', {
        component: 'fingerprint-cache',
        removedCount: toRemove.length.toString(),
        remainingCount: recentFingerprints.size.toString()
      });
    }
  }

  recentFingerprints.set(key, {
    lastLogged: now,
    sessionId,
    fingerprintId
  });

  logger.debug('Fingerprint marked as logged', {
    component: 'fingerprint-cache',
    fingerprintId: fingerprintId.slice(0, 16),
    sessionId: sessionId.slice(0, 16),
    cacheSize: recentFingerprints.size.toString()
  });
}

/**
 * Get cache statistics (for monitoring).
 */
export function getCacheStats() {
  return {
    size: recentFingerprints.size,
    ttlHours: CACHE_TTL_MS / 60 / 60 / 1000,
    cleanupIntervalMinutes: CLEANUP_INTERVAL_MS / 60 / 1000,
    maxSize: MAX_CACHE_SIZE,
  };
}

/**
 * Invalidate fingerprint from cache (force re-enrichment on next request).
 *
 * @param fingerprintId - FingerprintJS visitor ID to invalidate
 */
export function invalidateFingerprint(fingerprintId: string): void {
  let invalidatedCount = 0;

  for (const [key] of recentFingerprints.entries()) {
    if (key.startsWith(`${fingerprintId}_`)) {
      recentFingerprints.delete(key);
      invalidatedCount++;
    }
  }

  if (invalidatedCount > 0) {
    logger.info('Fingerprint cache invalidated for consent update', {
      component: 'fingerprint-cache',
      fingerprintId: fingerprintId.slice(0, 16),
      invalidatedCount: invalidatedCount.toString()
    });
  }
}

/**
 * Clear cache (for testing).
 */
export function clearCache(): void {
  recentFingerprints.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  logger.info('Fingerprint cache cleared', { component: 'fingerprint-cache' });
}
