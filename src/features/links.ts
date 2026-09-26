import chalk from 'chalk';
import { spawn, type ChildProcess } from 'child_process';
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

function browserCommand(url: string): [string, string[]] {
  if (process.platform === 'darwin') return ['open', [url]];
  // rundll32 takes the URL as one argument, so no shell ever parses it.
  if (process.platform === 'win32' || process.env['WSL_DISTRO_NAME']) {
    return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  }
  return ['xdg-open', [url]];
}

export async function launchBrowserUrl(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const [command, args] = browserCommand(url);
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
    return await settleBrowserLauncher(child);
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
