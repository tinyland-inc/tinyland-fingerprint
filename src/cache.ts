











import { getScopedLogger } from './config.js';

const logger = getScopedLogger('fingerprint-cache');




interface CacheEntry {
  lastLogged: number; 
  sessionId: string;
  fingerprintId: string;
}





const recentFingerprints = new Map<string, CacheEntry>();




const CACHE_TTL_MS = 6 * 60 * 60 * 1000; 
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; 
const MAX_CACHE_SIZE = 10000;




let cleanupTimer: ReturnType<typeof setInterval> | null = null;




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




function startCleanupTimer(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL_MS);

  
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }

  logger.info('Fingerprint cache cleanup timer started', {
    component: 'fingerprint-cache',
    cleanupIntervalMinutes: (CLEANUP_INTERVAL_MS / 60 / 1000).toString(),
    ttlHours: (CACHE_TTL_MS / 60 / 60 / 1000).toString()
  });
}








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







export function markAsLogged(fingerprintId: string, sessionId: string = 'anonymous'): void {
  const key = `${fingerprintId}_${sessionId}`;
  const now = Date.now();

  
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




export function getCacheStats() {
  return {
    size: recentFingerprints.size,
    ttlHours: CACHE_TTL_MS / 60 / 60 / 1000,
    cleanupIntervalMinutes: CLEANUP_INTERVAL_MS / 60 / 1000,
    maxSize: MAX_CACHE_SIZE,
  };
}






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




export function clearCache(): void {
  recentFingerprints.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  logger.info('Fingerprint cache cleared', { component: 'fingerprint-cache' });
}
