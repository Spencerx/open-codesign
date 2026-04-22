/**
 * Boot-phase failure fallback.
 *
 * Runs before our electron-log sink is initialized, so this module MUST NOT
 * depend on `./logger`. Everything here is synchronous + dependency-free so
 * it works even if the user's config / snapshots DB / safeStorage backend is
 * corrupt.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface BootFailureContext {
  error: unknown;
  logsDir: string;
  appVersion: string;
  platform: string;
  electronVersion: string;
  nodeVersion: string;
}

export interface BootFailureResult {
  bootLogPath: string;
  userChoice: 'quit' | 'openFolder';
}

const BOOT_LOG_NAME = 'boot-errors.log';

export function formatBootError(ctx: BootFailureContext): string {
  const { error, appVersion, platform, electronVersion, nodeVersion } = ctx;
  const timestamp = new Date().toISOString();
  const err = error instanceof Error ? error : null;
  const message = err?.message ?? String(error);
  const stack = err?.stack ?? '(no stack available)';

  return [
    '# Open CoDesign boot failure',
    '',
    `Timestamp: ${timestamp}`,
    `App version: ${appVersion}`,
    `Platform: ${platform}`,
    `Electron: ${electronVersion}`,
    `Node: ${nodeVersion}`,
    '',
    '## Error',
    '',
    message,
    '',
    '## Stack',
    '',
    stack,
    '',
  ].join('\n');
}

/**
 * Synchronously writes the boot-error log. Never throws: if the primary
 * `logsDir` is unwritable (ENOENT after mkdir, EACCES, read-only FS),
 * fall back to the OS tmpdir so the operator always has something to
 * attach to the bug report.
 */
export function writeBootErrorSync(ctx: BootFailureContext): string {
  const body = formatBootError(ctx);
  const primaryPath = join(ctx.logsDir, BOOT_LOG_NAME);
  try {
    mkdirSync(ctx.logsDir, { recursive: true });
    writeFileSync(primaryPath, body, { encoding: 'utf8' });
    return primaryPath;
  } catch {
    const fallbackPath = join(tmpdir(), BOOT_LOG_NAME);
    try {
      writeFileSync(fallbackPath, body, { encoding: 'utf8' });
    } catch {
      // Truly unwritable environment — return the intended path anyway so
      // the dialog still shows the user where we tried.
    }
    return fallbackPath;
  }
}
