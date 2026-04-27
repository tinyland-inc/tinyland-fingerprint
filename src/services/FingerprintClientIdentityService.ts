import { isTempFingerprint } from '@tummycrypt/tinyland-security';

export interface EnsureClientFingerprintReadyOptions {
  readCurrentFingerprint: () => string | null;
  generateFingerprint: () => Promise<string>;
  upgradeFingerprint: (
    oldFingerprint: string,
    newFingerprint: string,
  ) => Promise<void>;
  persistFingerprint: (fingerprint: string) => void;
  waitForPropagation?: () => Promise<void>;
}

export interface EnsureClientFingerprintReadyResult {
  fingerprintId: string | null;
  state: 'generated' | 'upgraded' | 'existing';
  previousFingerprint: string | null;
}

async function defaultWaitForPropagation(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function ensureClientFingerprintReady(
  options: EnsureClientFingerprintReadyOptions,
): Promise<EnsureClientFingerprintReadyResult> {
  const {
    readCurrentFingerprint,
    generateFingerprint,
    upgradeFingerprint,
    persistFingerprint,
    waitForPropagation = defaultWaitForPropagation,
  } = options;

  const currentFingerprint = readCurrentFingerprint();

  if (!currentFingerprint) {
    const fingerprint = await generateFingerprint();
    persistFingerprint(fingerprint);
    await waitForPropagation();

    return {
      fingerprintId: fingerprint,
      state: 'generated',
      previousFingerprint: null,
    };
  }

  if (isTempFingerprint(currentFingerprint)) {
    const fingerprint = await generateFingerprint();
    await upgradeFingerprint(currentFingerprint, fingerprint);
    await waitForPropagation();

    return {
      fingerprintId: fingerprint,
      state: 'upgraded',
      previousFingerprint: currentFingerprint,
    };
  }

  await waitForPropagation();

  return {
    fingerprintId: currentFingerprint,
    state: 'existing',
    previousFingerprint: currentFingerprint,
  };
}
