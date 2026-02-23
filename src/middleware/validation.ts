








import { getScopedLogger, getFingerprintConfig } from '../config.js';
import type { FingerprintRequestContext, ConsentPreferenceData } from '../services/FingerprintEnrichmentService.js';
import { enrichFingerprintOnMismatch, enrichFingerprintOnValidation } from '../services/FingerprintEnrichmentService.js';

const logger = getScopedLogger('fingerprint-validation');

interface SessionFingerprint {
  sessionId: string;
  fingerprintHash: string;
  createdAt: Date;
  lastValidated: Date;
  userId: string;
}


const sessionFingerprints = new Map<string, SessionFingerprint>();






export async function storeFingerprint(
  sessionId: string,
  userId: string,
  fingerprint: string
): Promise<void> {
  const config = getFingerprintConfig();
  const hashFn = config.hashFingerprint ?? ((fp: string) => fp);
  const fingerprintHash = await Promise.resolve(hashFn(fingerprint));

  sessionFingerprints.set(sessionId, {
    sessionId,
    fingerprintHash,
    createdAt: new Date(),
    lastValidated: new Date(),
    userId
  });

  logger.info('Fingerprint stored for session', {
    'session.id': sessionId,
    'user.id': userId,
    'fingerprint.hash': fingerprintHash.slice(0, 8) + '...',
    'trace_context': 'fingerprint_store'
  });
}






export async function validateFingerprint(
  ctx: FingerprintRequestContext
): Promise<{ valid: boolean; reason?: string }> {
  const config = getFingerprintConfig();

  
  if (!ctx.user || !ctx.session) {
    return { valid: true };
  }

  const sessionId = ctx.session.id!;
  const clientFingerprint = ctx.cookies?.get('fp_id');

  
  if (!clientFingerprint) {
    logger.warn('Missing fingerprint cookie', {
      'session.id': sessionId,
      'user.id': ctx.user.id!,
      'alert.type': 'missing_fingerprint',
      'severity': 'low'
    });
    return { valid: true, reason: 'missing_fingerprint_cookie' };
  }

  
  const stored = sessionFingerprints.get(sessionId);
  if (!stored) {
    logger.warn('No stored fingerprint for session', {
      'session.id': sessionId,
      'user.id': ctx.user.id!,
      'alert.type': 'missing_stored_fingerprint',
      'severity': 'low'
    });
    await storeFingerprint(sessionId, ctx.user.id!, clientFingerprint);
    return { valid: true };
  }

  
  const hashFn = config.hashFingerprint ?? ((fp: string) => fp);
  const clientFingerprintHash = await Promise.resolve(hashFn(clientFingerprint));

  if (clientFingerprintHash !== stored.fingerprintHash) {
    
    logger.error('Session hijacking detected: Fingerprint mismatch', {
      'session.id': sessionId,
      'user.id': ctx.user.id!,
      'fingerprint.expected': stored.fingerprintHash.slice(0, 8) + '...',
      'fingerprint.received': clientFingerprintHash.slice(0, 8) + '...',
      'fingerprint.created_at': stored.createdAt.toISOString(),
      'fingerprint.last_validated': stored.lastValidated.toISOString(),
      'alert.type': 'session_hijacking',
      'severity': 'critical',
    });

    try {
      await enrichFingerprintOnMismatch(
        ctx,
        clientFingerprint,
        stored.fingerprintHash,
        clientFingerprintHash
      );
    } catch (enrichError) {
      logger.warn('Failed to enrich fingerprint on mismatch', {
        error: enrichError instanceof Error ? enrichError.message : String(enrichError),
        session_id: sessionId,
        user_id: ctx.user.id!
      });
    }

    return { valid: false, reason: 'fingerprint_mismatch' };
  }

  
  stored.lastValidated = new Date();
  sessionFingerprints.set(sessionId, stored);

  
  try {
    await enrichFingerprintOnValidation(ctx, clientFingerprint);
    logger.info('Fingerprint enriched on validation', {
      'session.id': sessionId,
      'user.id': ctx.user.id!
    });
  } catch (enrichError) {
    logger.error('Failed to enrich fingerprint on validation', {
      error: enrichError instanceof Error ? enrichError.message : String(enrichError),
      'session.id': sessionId
    });
  }

  return { valid: true };
}




export function clearFingerprint(sessionId: string): void {
  const removed = sessionFingerprints.delete(sessionId);

  if (removed) {
    logger.info('Fingerprint cleared for session', {
      'session.id': sessionId,
      'trace_context': 'fingerprint_clear'
    });
  }
}




export function getSessionFingerprint(sessionId: string): SessionFingerprint | null {
  return sessionFingerprints.get(sessionId) || null;
}





export function cleanExpiredFingerprints(): number {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let removed = 0;

  for (const [sessionId, fp] of sessionFingerprints.entries()) {
    if (fp.lastValidated < thirtyDaysAgo) {
      sessionFingerprints.delete(sessionId);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info('Cleaned expired fingerprints', {
      'fingerprints.removed': removed.toString(),
      'trace_context': 'fingerprint_cleanup'
    });
  }

  return removed;
}
