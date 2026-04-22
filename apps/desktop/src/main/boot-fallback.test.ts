import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatBootError, writeBootErrorSync } from './boot-fallback';

function mkCtx(overrides: Partial<Parameters<typeof formatBootError>[0]> = {}) {
  return {
    error: new Error('bad config'),
    logsDir: join(tmpdir(), 'open-codesign-boot-fallback-test'),
    appVersion: '0.2.0',
    platform: 'darwin',
    electronVersion: '30.0.0',
    nodeVersion: '22.0.0',
    ...overrides,
  };
}

describe('formatBootError', () => {
  it('includes message, stack, and env for Error inputs', () => {
    const err = new Error('kaboom');
    const out = formatBootError(mkCtx({ error: err }));
    expect(out).toContain('kaboom');
    expect(out).toContain('App version: 0.2.0');
    expect(out).toContain('Electron: 30.0.0');
    const firstStackLine = err.stack?.split('\n')[0] ?? '';
    expect(out).toContain(firstStackLine);
  });

  it('stringifies non-Error values with a placeholder stack', () => {
    const out = formatBootError(mkCtx({ error: 'string-err' }));
    expect(out).toContain('string-err');
    expect(out).toContain('(no stack available)');
  });

  it('includes a timestamp in ISO 8601 form', () => {
    const out = formatBootError(mkCtx());
    expect(out).toMatch(/Timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('writeBootErrorSync', () => {
  it('writes to the provided logsDir, creating it if missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'boot-fallback-ok-'));
    const nested = join(dir, 'nested-logs');
    try {
      const out = writeBootErrorSync(mkCtx({ logsDir: nested }));
      expect(out).toBe(join(nested, 'boot-errors.log'));
      expect(existsSync(out)).toBe(true);
      expect(readFileSync(out, 'utf8')).toContain('Open CoDesign boot failure');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the OS tmpdir when the primary path is unwritable', () => {
    // Give a path we cannot create (under /dev/null). mkdirSync will throw,
    // and writeBootErrorSync must catch and redirect to tmpdir.
    const bogus = '/dev/null/does-not-exist/logs';
    const out = writeBootErrorSync(mkCtx({ logsDir: bogus }));
    expect(out).toBe(join(tmpdir(), 'boot-errors.log'));
    expect(existsSync(out)).toBe(true);
  });
});
