/**
 * Version update checker
 * Non-blocking check against npm registry for newer versions.
 */

import chalk from 'chalk';
import { APP_INFO } from '../config/data.js';
import { t, fmt } from '../i18n/index.js';

const NPM_REGISTRY_URL = `https://registry.npmjs.org/@nbtca/prompt/latest`;

interface NpmLatest {
  version: string;
}

/**
 * Fetch latest version from npm registry.
 * Returns null on any failure (network, timeout, parse, or `signal` aborting
 * the request — e.g. the caller quit before this settled).
 */
async function fetchLatestVersion(signal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);
  try {
    const res = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NpmLatest;
    return data.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Compare semver strings. Returns true if remote > local.
 */
function isNewer(local: string, remote: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const l = parse(local);
  const r = parse(remote);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (l[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (l[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Non-blocking update check for TUI startup.
 * Resolves to a notification string or null. Pass `signal` so a caller that
 * quits before this settles can cancel the in-flight request instead of
 * leaving it to hold the process open.
 */
export async function checkForUpdate(signal?: AbortSignal): Promise<string | null> {
  const latest = await fetchLatestVersion(signal);
  if (!latest || !isNewer(APP_INFO.version, latest)) return null;
  const trans = t();
  return `${fmt(trans.update.available, { latest, current: APP_INFO.version })}  ${chalk.dim(trans.update.command)}`;
}

/**
 * Explicit update check command (nbtca update).
 */
export async function runUpdateCheck(): Promise<void> {
  const trans = t();
  const latest = await fetchLatestVersion();

  if (!latest) {
    console.log(chalk.yellow(trans.update.checkFailed));
    return;
  }

  if (isNewer(APP_INFO.version, latest)) {
    console.log(chalk.yellow(`${fmt(trans.update.available, { latest, current: APP_INFO.version })}`));
    console.log(chalk.dim(trans.update.command));
  } else {
    console.log(chalk.green(`${fmt(trans.update.upToDate, { version: APP_INFO.version })}`));
  }
}
