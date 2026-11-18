import chalk from 'chalk';
import { APP_INFO } from '../config/data.js';
import { t, fmt } from '../i18n/index.js';

const NPM_REGISTRY_URL = `https://registry.npmjs.org/@nbtca/prompt/latest`;
// The registry can take over 4 seconds to answer from mainland China, so a tight limit fails healthy checks.
const ATTEMPT_TIMEOUT_MS = 8000;
const ATTEMPTS = 2;

interface NpmLatest {
  version?: unknown;
}

export type LatestVersion = { version: string } | { error: 'timeout' | 'network' | 'response' };

/** Retries a connection error once; a timeout already spent the wait, so it is not retried. */
export async function fetchLatestVersion(
  fetcher: typeof fetch = fetch,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
): Promise<LatestVersion> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetcher(NPM_REGISTRY_URL, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return { error: 'response' };
      const data = (await res.json()) as NpmLatest;
      return typeof data.version === 'string' ? { version: data.version } : { error: 'response' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError')
        return { error: 'timeout' };
    }
  }
  return { error: 'network' };
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

export async function runUpdateCheck(fetcher?: typeof fetch): Promise<boolean> {
  const trans = t().update;
  const latest = await fetchLatestVersion(fetcher);

  if ('error' in latest) {
    const reason =
      latest.error === 'timeout'
        ? trans.checkTimedOut
        : latest.error === 'network'
          ? trans.checkOffline
          : trans.checkFailed;
    console.error(chalk.yellow(reason));
    console.error(chalk.dim(trans.command));
    return false;
  }

  if (isNewer(APP_INFO.version, latest.version)) {
    console.log(
      chalk.yellow(fmt(trans.available, { latest: latest.version, current: APP_INFO.version })),
    );
    console.log(chalk.dim(trans.command));
  } else {
    console.log(chalk.green(fmt(trans.upToDate, { version: APP_INFO.version })));
  }
  return true;
}
