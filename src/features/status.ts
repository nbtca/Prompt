import axios from 'axios';
import chalk from 'chalk';
import { URLS } from '../config/data.js';
import { pickIcon } from '../core/icons.js';
import { padEndV } from '../core/text.js';
import { createSpinner, success, warning } from '../core/ui.js';
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

const SERVICE_TARGETS = [
  { name: 'Website', url: URLS.homepage },
  { name: 'Docs', url: URLS.docs },
  { name: 'Calendar', url: URLS.calendar },
  { name: 'GitHub', url: URLS.github },
  { name: 'Roadmap', url: URLS.roadmap },
] as const;

async function checkService(name: string, url: string, timeoutMs: number): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': 'NBTCA-CLI/2.4.0' },
    });
    const latencyMs = Date.now() - start;
    const ok = response.status >= 200 && response.status < 400;
    return { name, url, ok, statusCode: response.status, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
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
    SERVICE_TARGETS.map((service) => checkServiceWithRetry(service.name, service.url, timeoutMs, retries))
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
  const color = options?.color !== false;
  const id = (s: string) => s;
  const dim = color ? chalk.dim : id;
  const green = color ? chalk.green : id;
  const red = color ? chalk.red : id;
  const cyan = color ? chalk.cyan : id;

  const trans = t();
  const nameWidth = 10;
  const statusWidth = 9;
  const codeWidth = 7;
  const latencyWidth = 10;

  const h = pickIcon('─', '-');
  const v = pickIcon('│', '|');
  const topLeft = pickIcon('┌', '+');
  const topMid = pickIcon('┬', '+');
  const topRight = pickIcon('┐', '+');
  const midLeft = pickIcon('├', '+');
  const midMid = pickIcon('┼', '+');
  const midRight = pickIcon('┤', '+');
  const bottomLeft = pickIcon('└', '+');
  const bottomMid = pickIcon('┴', '+');
  const bottomRight = pickIcon('┘', '+');

  const top = `${topLeft}${h.repeat(nameWidth + 2)}${topMid}${h.repeat(statusWidth + 2)}${topMid}${h.repeat(codeWidth + 2)}${topMid}${h.repeat(latencyWidth + 2)}${topMid}${h.repeat(34)}${topRight}`;
  const divider = `${midLeft}${h.repeat(nameWidth + 2)}${midMid}${h.repeat(statusWidth + 2)}${midMid}${h.repeat(codeWidth + 2)}${midMid}${h.repeat(latencyWidth + 2)}${midMid}${h.repeat(34)}${midRight}`;
  const bottom = `${bottomLeft}${h.repeat(nameWidth + 2)}${bottomMid}${h.repeat(statusWidth + 2)}${bottomMid}${h.repeat(codeWidth + 2)}${bottomMid}${h.repeat(latencyWidth + 2)}${bottomMid}${h.repeat(34)}${bottomRight}`;

  const header =
    `${v} ${padEndV(trans.status.service, nameWidth)} ${v} ${padEndV(trans.status.health, statusWidth)} ${v} ${padEndV(trans.status.code, codeWidth)} ${v} ${padEndV(trans.status.latency, latencyWidth)} ${v} ${padEndV(trans.status.url, 34)} ${v}`;

  const lines = [dim(top), header, dim(divider)];
  for (const item of items) {
    const statusLabel = item.ok
      ? green(`${pickIcon('●', 'OK')} ${trans.status.up}`)
      : red(`${pickIcon('●', '!!')} ${trans.status.down}`);
    const code = item.statusCode ? String(item.statusCode) : '-';
    const latency = item.latencyMs != null ? `${item.latencyMs}ms` : '-';
    const url = item.url.length > 34 ? `${item.url.slice(0, 31)}...` : item.url;

    lines.push(
      `${v} ${padEndV(cyan(item.name), nameWidth)} ${v} ${padEndV(statusLabel, statusWidth)} ${v} ${padEndV(code, codeWidth)} ${v} ${padEndV(latency, latencyWidth)} ${v} ${padEndV(url, 34)} ${v}`
    );
  }
  lines.push(dim(bottom));
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
  console.log(renderServiceStatusTable(items, { color: !!process.stdout.isTTY }));
  if (hasFailures) {
    warning(trans.status.summaryFail);
  } else {
    success(trans.status.summaryOk);
  }
  return items;
}
