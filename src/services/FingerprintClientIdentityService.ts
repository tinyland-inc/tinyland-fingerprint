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

// CARE ITEM (TIN-1744, 4/5): this is a fix, not a regression. 0.2.3
// (standalone) imported `isTempFingerprint` from
// `@tummycrypt/tinyland-security` — a package whose barrel pulls in
// server-only code and broke browser bundles that consume this
// (browser-facing) service. Vendored 0.3.0 commit f14515f3b ("fix: keep
// browser bundles off server-only barrels") de-imported it in favor of this
// one-line local inline, which is byte-identical in behavior. Ported here
// deliberately to fix the standalone's import, not to reintroduce it.
function isTempFingerprint(fingerprintId: string | null | undefined): boolean {
  return !!fingerprintId && fingerprintId.startsWith('temp_');
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
