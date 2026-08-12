import chalk from 'chalk';
import open from 'open';
import type { ChildProcess } from 'node:child_process';
import { sanitizeTerminalLine } from '../core/text.js';
import { fmt, t } from '../i18n/index.js';

const BROWSER_LAUNCH_SETTLE_MS = 1000;

function settleBrowserLauncher(child: ChildProcess): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(true);
    }, BROWSER_LAUNCH_SETTLE_MS);

    function finish(success: boolean): void {
      if (settled) return;
      settled = true;
      child.off('close', onClose);
      child.off('error', onError);
      clearTimeout(timer);
      resolve(success);
    }
    function onClose(code: number | null, signal: NodeJS.Signals | null): void {
      finish(code === 0 && signal === null);
    }
    function onError(): void {
      finish(false);
    }

    child.once('close', onClose);
    child.once('error', onError);
    if (child.exitCode !== null || child.signalCode !== null) {
      finish(child.exitCode === 0 && child.signalCode === null);
      return;
    }
  });
}

export async function launchBrowserUrl(url: string): Promise<boolean> {
  try {
    return await settleBrowserLauncher(await open(url));
  } catch {
    return false;
  }
}

export async function openUrlInBrowser(url: string): Promise<boolean> {
  const safeUrl = sanitizeTerminalLine(url);
  if (await launchBrowserUrl(safeUrl)) return true;

  const trans = t().links;
  console.error(chalk.red(trans.error));
  console.error(chalk.dim(fmt(trans.openManually, { url: safeUrl })));
  return false;
}
