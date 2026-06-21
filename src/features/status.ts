import chalk from 'chalk';
import { APP_INFO, URLS } from '../config/data.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, visualWidth } from '../core/text.js';
import { c } from '../core/theme.js';
import { createSpinner } from '../core/ui.js';
import { t } from '../i18n/index.js';

export interface ServiceStatus {
  name: string;
  url: string;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

export interface StatusCheckOptions {
  timeoutMs?: number;
  retries?: number;
}

function getServiceTargets() {
  const trans = t();
  return [
    { name: trans.status.serviceWebsite,  url: URLS.homepage },
    { name: trans.status.serviceDocs,     url: URLS.docs },
    { name: trans.status.serviceCalendar, url: URLS.calendar },
    { name: trans.status.serviceGithub,   url: URLS.github },
    { name: trans.status.serviceRoadmap,  url: URLS.roadmap },
  ];
}

async function checkService(name: string, url: string, timeoutMs: number): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': `NBTCA-CLI/${APP_INFO.version}` },
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const ok = response.status >= 200 && response.status < 400;
    return { name, url, ok, statusCode: response.status, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error
      ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
      : String(err);
    return { name, url, ok: false, latencyMs, error };
  }
}

async function checkServiceWithRetry(
  name: string,
  url: string,
  timeoutMs: number,
  retries: number
): Promise<ServiceStatus> {
  let lastResult = await checkService(name, url, timeoutMs);
  if (lastResult.ok) return lastResult;

  for (let attempt = 0; attempt < retries; attempt++) {
    // Retry for transient transport errors and upstream server errors.
    if (!lastResult.error && !(lastResult.statusCode != null && lastResult.statusCode >= 500)) {
      break;
    }
    lastResult = await checkService(name, url, timeoutMs);
    if (lastResult.ok) return lastResult;
  }

  return lastResult;
}

export async function checkServices(options: StatusCheckOptions = {}): Promise<ServiceStatus[]> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const retries = options.retries ?? 1;
  return Promise.all(
    getServiceTargets().map((service) => checkServiceWithRetry(service.name, service.url, timeoutMs, retries))
  );
}

export function serializeServiceStatus(items: ServiceStatus[]) {
  return items.map((item) => ({
    name: item.name,
    url: item.url,
    ok: item.ok,
    statusCode: item.statusCode ?? null,
    latencyMs: item.latencyMs ?? null,
    error: item.error ?? null,
  }));
}

export function hasServiceFailures(items: ServiceStatus[]): boolean {
  return items.some((item) => !item.ok);
}

export function countServiceHealth(items: ServiceStatus[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const item of items) {
    if (item.ok) {
      up += 1;
    } else {
      down += 1;
    }
  }
  return { up, down };
}

export function renderServiceStatusTable(items: ServiceStatus[], options?: { color?: boolean }): string {
  const useColor = options?.color !== false;
  const id = (s: string) => s;
  const applyDim    = useColor ? chalk.dim                  : id;
  const applyGreen  = useColor ? chalk.green                : id;
  const applyRed    = useColor ? chalk.red                  : id;
  const applyCyan   = useColor ? chalk.cyan                 : id;
  const applyLatency = useColor ? c.latency                 : (ms: number) => `${ms}ms`;

  const trans = t();
  const nameWidth = Math.max(...items.map(i => visualWidth(i.name)), visualWidth(trans.status.service));
  const statusWidth = 10; // "● online" / "✕ offline"

  const onIcon  = pickIcon('●', '+');
  const offIcon = pickIcon('✕', '!');
  const sep     = pickIcon('─', '-');

  const headerName   = padEndV(applyDim(trans.status.service), nameWidth);
  const headerStatus = padEndV(applyDim(trans.status.health),  statusWidth);
  const headerLatency = applyDim(trans.status.latency);
  const divider = applyDim(sep.repeat(nameWidth + statusWidth + 12));

  const lines: string[] = [
    `  ${headerName}  ${headerStatus}  ${headerLatency}`,
    `  ${divider}`,
  ];

  for (const item of items) {
    const nameCol = padEndV(applyCyan(item.name), nameWidth);

    const statusLabel = item.ok
      ? applyGreen(`${onIcon} ${trans.status.up}`)
      : applyRed(`${offIcon} ${trans.status.down}`);
    const statusCol = padEndV(statusLabel, statusWidth);

    const latencyCol = item.latencyMs != null
      ? applyLatency(item.latencyMs)
      : applyDim('—');

    lines.push(`  ${nameCol}  ${statusCol}  ${latencyCol}`);
  }

  return lines.join('\n');
}

export async function showServiceStatus(): Promise<ServiceStatus[]> {
  const trans = t();
  const spinner = createSpinner(trans.status.checking);
  const items = await checkServices();
  const hasFailures = hasServiceFailures(items);
  if (hasFailures) {
    spinner.error(trans.status.summaryFail);
  } else {
    spinner.stop(trans.status.summaryOk);
  }
  console.log();
  console.log(renderServiceStatusTable(items, { color: !!process.stdout.isTTY }));
  console.log();
  return items;
}
