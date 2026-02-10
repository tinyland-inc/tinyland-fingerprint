import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureFingerprint,
  getFingerprintConfig,
  resetFingerprintConfig,
  getScopedLogger,
  withSpan,
  withTracerSpan,
  noopSpan,
  DEFAULT_CONSENT,
} from '../src/config.js';

describe('FingerprintConfig', () => {
  beforeEach(() => {
    resetFingerprintConfig();
  });

  describe('configureFingerprint', () => {
    it('should accept partial config and merge', () => {
      configureFingerprint({ lokiUrl: 'http://loki:3100' });
      const config = getFingerprintConfig();
      expect(config.lokiUrl).toBe('http://loki:3100');
    });

    it('should merge multiple configure calls', () => {
      configureFingerprint({ lokiUrl: 'http://loki:3100' });
      configureFingerprint({ nodeEnv: 'test' });
      const config = getFingerprintConfig();
      expect(config.lokiUrl).toBe('http://loki:3100');
      expect(config.nodeEnv).toBe('test');
    });

    it('should overwrite existing keys', () => {
      configureFingerprint({ lokiUrl: 'http://old:3100' });
      configureFingerprint({ lokiUrl: 'http://new:3100' });
      const config = getFingerprintConfig();
      expect(config.lokiUrl).toBe('http://new:3100');
    });
  });

  describe('getFingerprintConfig', () => {
    it('should return console logger as default', () => {
      const config = getFingerprintConfig();
      expect(config.logger).toBeDefined();
      expect(typeof config.logger.info).toBe('function');
      expect(typeof config.logger.warn).toBe('function');
      expect(typeof config.logger.error).toBe('function');
      expect(typeof config.logger.debug).toBe('function');
    });

    it('should return default consent when not configured', () => {
      const config = getFingerprintConfig();
      expect(config.defaultConsent).toEqual(DEFAULT_CONSENT);
    });

    it('should return configured logger', () => {
      const customLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      };
      configureFingerprint({ logger: customLogger });
      const config = getFingerprintConfig();
      expect(config.logger).toBe(customLogger);
    });

    it('should return undefined for optional unconfigured callbacks', () => {
      const config = getFingerprintConfig();
      expect(config.hashFingerprint).toBeUndefined();
      expect(config.detectVPN).toBeUndefined();
      expect(config.tempoQueryService).toBeUndefined();
    });
  });

  describe('resetFingerprintConfig', () => {
    it('should clear all configuration', () => {
      configureFingerprint({
        lokiUrl: 'http://loki:3100',
        nodeEnv: 'production',
      });
      resetFingerprintConfig();
      const config = getFingerprintConfig();
      expect(config.lokiUrl).toBeUndefined();
    });
  });

  describe('getScopedLogger', () => {
    it('should return default logger when scopedLogger not configured', () => {
      const scoped = getScopedLogger('test-scope');
      expect(typeof scoped.info).toBe('function');
    });

    it('should use scopedLogger factory when configured', () => {
      const scopeReceived: string[] = [];
      configureFingerprint({
        scopedLogger: (scope: string) => {
          scopeReceived.push(scope);
          return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
        }
      });
      getScopedLogger('my-scope');
      expect(scopeReceived).toContain('my-scope');
    });
  });

  describe('DEFAULT_CONSENT', () => {
    it('should have essential true and all others false', () => {
      expect(DEFAULT_CONSENT.essential).toBe(true);
      expect(DEFAULT_CONSENT.preferences).toBe(false);
      expect(DEFAULT_CONSENT.functional).toBe(false);
      expect(DEFAULT_CONSENT.tracking).toBe(false);
      expect(DEFAULT_CONSENT.performance).toBe(false);
    });
  });

  describe('noopSpan', () => {
    it('should have all methods as no-ops', () => {
      expect(() => noopSpan.setAttribute('key', 'value')).not.toThrow();
      expect(() => noopSpan.recordException(new Error('test'))).not.toThrow();
      expect(() => noopSpan.setStatus({ code: 1 })).not.toThrow();
      expect(() => noopSpan.end()).not.toThrow();
    });
  });

  describe('withSpan', () => {
    it('should execute function with noopSpan when createSpan not configured', async () => {
      const result = await withSpan('test', async (span) => {
        span.setAttribute('key', 'value');
        return 42;
      });
      expect(result).toBe(42);
    });

    it('should use configured createSpan', async () => {
      const spanNames: string[] = [];
      configureFingerprint({
        createSpan: async (name, fn) => {
          spanNames.push(name);
          return fn(noopSpan);
        }
      });

      await withSpan('my-span', async () => 'done');
      expect(spanNames).toContain('my-span');
    });
  });

  describe('withTracerSpan', () => {
    it('should execute function with noopSpan when tracer not configured', async () => {
      const result = await withTracerSpan('test', async (span) => {
        span.setAttribute('key', 'value');
        return 'result';
      });
      expect(result).toBe('result');
    });

    it('should use configured tracer', async () => {
      const spanNames: string[] = [];
      configureFingerprint({
        getTracer: () => ({
          startActiveSpan: async (name, fn) => {
            spanNames.push(name);
            return fn(noopSpan);
          }
        })
      });

      await withTracerSpan('tracer-span', async () => 'done');
      expect(spanNames).toContain('tracer-span');
    });
  });
});
