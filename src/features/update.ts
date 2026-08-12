import chalk from 'chalk';
import { APP_INFO } from '../config/data.js';
import { t, fmt } from '../i18n/index.js';

const NPM_REGISTRY_URL = `https://registry.npmjs.org/@nbtca/prompt/latest`;

interface NpmLatest {
  version?: unknown;
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 3000);
  timeout.unref();
  try {
    const res = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NpmLatest;
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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

export async function runUpdateCheck(): Promise<boolean> {
  const trans = t();
  const latest = await fetchLatestVersion();

  if (!latest) {
    console.error(chalk.yellow(trans.update.checkFailed));
    return false;
  }

  if (isNewer(APP_INFO.version, latest)) {
    console.log(chalk.yellow(fmt(trans.update.available, { latest, current: APP_INFO.version })));
    console.log(chalk.dim(trans.update.command));
  } else {
    console.log(chalk.green(fmt(trans.update.upToDate, { version: APP_INFO.version })));
  }
  return true;
}
