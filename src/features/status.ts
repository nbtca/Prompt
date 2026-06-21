import chalk from 'chalk';
import { APP_INFO, URLS } from '../config/data.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, visualWidth } from '../core/text.js';
import { c } from '../core/theme.js';
import { createSpinner } from '../core/ui.js';
import { t } from '../i18n/index.js';

type ServiceGroup = 'nbtca' | 'external' | 'intranet';

interface ServiceTarget {
  name: string;
  url: string;
  group: ServiceGroup;
  intranet?: boolean;
}

export interface ServiceStatus {
  name: string;
  url: string;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
  group?: ServiceGroup;
  intranet?: boolean;
}

export interface StatusCheckOptions {
  timeoutMs?: number;
  retries?: number;
}

function getServiceTargets(): ServiceTarget[] {
  const trans = t();
  return [
    // NBTCA-owned services
    { name: trans.status.serviceHomepage, url: URLS.homepage, group: 'nbtca' },
    { name: trans.status.serviceDocs,     url: URLS.docs,     group: 'nbtca' },
    { name: trans.status.serviceIcal,     url: URLS.calendar, group: 'nbtca' },
    { name: trans.status.serviceRepair,   url: URLS.repair,   group: 'nbtca' },
    // External platforms
    { name: trans.status.serviceGithub,   url: URLS.github,   group: 'external' },
    { name: trans.status.serviceRoadmap,  url: URLS.roadmap,  group: 'external' },
    // Intranet services (campus LAN only)
    { name: trans.status.serviceCloud,    url: URLS.cloud,    group: 'intranet', intranet: true },
    { name: trans.status.serviceMirror,   url: URLS.mirror,   group: 'intranet', intranet: true },
  ];
}

async function checkService(name: string, url: string, timeoutMs: number): Promise<Omit<ServiceStatus, 'group' | 'intranet'>> {
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
  target: ServiceTarget,
  timeoutMs: number,
  retries: number
): Promise<ServiceStatus> {
  let lastResult = await checkService(target.name, target.url, timeoutMs);
  if (!lastResult.ok) {
    for (let attempt = 0; attempt < retries; attempt++) {
      if (!lastResult.error && !(lastResult.statusCode != null && lastResult.statusCode >= 500)) break;
      lastResult = await checkService(target.name, target.url, timeoutMs);
      if (lastResult.ok) break;
    }
  }
  return { ...lastResult, group: target.group, intranet: target.intranet };
}

export async function checkServices(options: StatusCheckOptions = {}): Promise<ServiceStatus[]> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const retries = options.retries ?? 1;
  return Promise.all(getServiceTargets().map(t => checkServiceWithRetry(t, timeoutMs, retries)));
}

export function serializeServiceStatus(items: ServiceStatus[]) {
  return items.map((item) => ({
    name: item.name,
    url: item.url,
    ok: item.ok,
    statusCode: item.statusCode ?? null,
    latencyMs: item.latencyMs ?? null,
    error: item.error ?? null,
    group: item.group ?? null,
    intranet: item.intranet ?? false,
  }));
}

export function hasServiceFailures(items: ServiceStatus[]): boolean {
  return items.some(item => !item.ok && !item.intranet);
}

export function countServiceHealth(items: ServiceStatus[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const item of items.filter(i => !i.intranet)) {
    if (item.ok) up++; else down++;
  }
  return { up, down };
}

export function renderServiceStatusTable(items: ServiceStatus[], options?: { color?: boolean }): string {
  const useColor = options?.color !== false;
  const id = (s: string) => s;
  const applyDim     = useColor ? chalk.dim    : id;
  const applyGreen   = useColor ? chalk.green  : id;
  const applyRed     = useColor ? chalk.red    : id;
  const applyCyan    = useColor ? chalk.cyan   : id;
  const applyLatency = useColor ? c.latency    : (ms: number) => `${ms}ms`;

  const trans = t();
  const nameWidth = Math.max(...items.map(i => visualWidth(i.name)), visualWidth(trans.status.service));
  const statusWidth = 10;

  const onIcon  = pickIcon('●', '+');
  const offIcon = pickIcon('✕', '!');
  const lanIcon = pickIcon('○', 'o');
  const sep     = pickIcon('─', '-');

  const lines: string[] = [];
  let currentGroup: ServiceGroup | undefined;

  for (const item of items) {
    if (item.group !== currentGroup) {
      if (currentGroup !== undefined) lines.push('');

      const groupLabel =
        item.group === 'nbtca'     ? trans.status.groupNbtca     :
        item.group === 'external'  ? trans.status.groupExternal  :
        item.group === 'intranet'  ? trans.status.groupIntranet  : '';

      lines.push(`  ${applyDim(groupLabel)}`);
      lines.push(`  ${applyDim(sep.repeat(nameWidth + statusWidth + 12))}`);
      currentGroup = item.group;
    }

    const nameCol = padEndV(item.intranet ? applyDim(item.name) : applyCyan(item.name), nameWidth);

    let statusLabel: string;
    if (item.ok) {
      statusLabel = applyGreen(`${onIcon} ${trans.status.up}`);
    } else if (item.intranet) {
      statusLabel = applyDim(`${lanIcon} ${trans.status.down}`);
    } else {
      statusLabel = applyRed(`${offIcon} ${trans.status.down}`);
    }
    const statusCol = padEndV(statusLabel, statusWidth);

    const latencyCol = item.ok && item.latencyMs != null
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
