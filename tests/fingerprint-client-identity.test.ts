import { describe, expect, it, vi } from 'vitest';
import { ensureClientFingerprintReady } from '../src/services/FingerprintClientIdentityService.js';

describe('FingerprintClientIdentityService', () => {
  it('generates and persists a fingerprint when none exists', async () => {
    const generateFingerprint = vi.fn().mockResolvedValue('fp_full_123');
    const persistFingerprint = vi.fn();
    const waitForPropagation = vi.fn().mockResolvedValue(undefined);

    const result = await ensureClientFingerprintReady({
      readCurrentFingerprint: () => null,
      generateFingerprint,
      upgradeFingerprint: vi.fn(),
      persistFingerprint,
      waitForPropagation,
    });

    expect(generateFingerprint).toHaveBeenCalled();
    expect(persistFingerprint).toHaveBeenCalledWith('fp_full_123');
    expect(waitForPropagation).toHaveBeenCalled();
    expect(result).toEqual({
      fingerprintId: 'fp_full_123',
      state: 'generated',
      previousFingerprint: null,
    });
  });

  it('upgrades a temporary fingerprint to a full fingerprint', async () => {
    const generateFingerprint = vi.fn().mockResolvedValue('fp_full_456');
    const upgradeFingerprint = vi.fn().mockResolvedValue(undefined);
    const waitForPropagation = vi.fn().mockResolvedValue(undefined);

    const result = await ensureClientFingerprintReady({
      readCurrentFingerprint: () => 'temp_1234567890abcdef1234567890abcdef',
      generateFingerprint,
      upgradeFingerprint,
      persistFingerprint: vi.fn(),
      waitForPropagation,
    });

    expect(generateFingerprint).toHaveBeenCalled();
    expect(upgradeFingerprint).toHaveBeenCalledWith(
      'temp_1234567890abcdef1234567890abcdef',
      'fp_full_456',
    );
    expect(waitForPropagation).toHaveBeenCalled();
    expect(result).toEqual({
      fingerprintId: 'fp_full_456',
      state: 'upgraded',
      previousFingerprint: 'temp_1234567890abcdef1234567890abcdef',
    });
  });

  it('returns existing full fingerprints without regeneration', async () => {
    const generateFingerprint = vi.fn();
    const upgradeFingerprint = vi.fn();
    const waitForPropagation = vi.fn().mockResolvedValue(undefined);

    const result = await ensureClientFingerprintReady({
      readCurrentFingerprint: () => 'fp_existing_789',
      generateFingerprint,
      upgradeFingerprint,
      persistFingerprint: vi.fn(),
      waitForPropagation,
    });

    expect(generateFingerprint).not.toHaveBeenCalled();
    expect(upgradeFingerprint).not.toHaveBeenCalled();
    expect(waitForPropagation).toHaveBeenCalled();
    expect(result).toEqual({
      fingerprintId: 'fp_existing_789',
      state: 'existing',
      previousFingerprint: 'fp_existing_789',
    });
  });
});
