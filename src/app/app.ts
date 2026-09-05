import { ansi, ensureCursorRestored } from '../core/canvas.js';
import { composeFrameLines, computeBodyRows, diffFrame } from './frame.js';
import { isPrintableKey, KeyStreamDecoder, routeGlobalKey, type ViewId } from './keys.js';
import { renderHeader, renderFooter, resolveChromeLayout } from './chrome.js';
import type { AppContext, AppSize, View } from './view.js';
import { homeView } from './views/home.js';
import { scheduleView } from './views/schedule.js';
import { docsView } from './views/docs.js';
import { eventsView } from './views/events.js';
import { settingsView } from './views/settings.js';
import { getAppTabs } from './tabs.js';

export async function runApp(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  let view: ViewId = 'home';
  let scroll = 0;
  let running = true;
  let suspended = false;
  let entered = false;
  const lifecycle = new AbortController();
  const keyDecoder = new KeyStreamDecoder();
  let keyFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setTimeout> | undefined;
  let painted: { cols: number; lines: string[] } | undefined;

  const viewIds = getAppTabs().map((tab) => tab.id);

  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
    schedule: scheduleView,
    docs: docsView,
    events: eventsView,
    settings: settingsView,
  };
  const pendingLoads = new Map<ViewId, Promise<void>>();

  function loadView(id: ViewId): void {
    const target = nativeViews[id];
    if (!target?.load || pendingLoads.has(id)) return;
    const pending = target
      .load(ctx)
      .catch(() => undefined)
      .finally(() => pendingLoads.delete(id));
    pendingLoads.set(id, pending);
  }

  function size(): AppSize {
    return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
  }

  const ctx: AppContext = {
    signal: lifecycle.signal,
    get size(): AppSize {
      return size();
    },
    get bodyRows(): number {
      const { rows } = size();
      const chrome = resolveChromeLayout(rows);
      return computeBodyRows(rows, chrome.headerLines, chrome.footerLines);
    },
    rerender(): void {
      render();
    },
    resetScroll(): void {
      scroll = 0;
    },
    runClassic(fn: () => Promise<void>): Promise<void> {
      return runClassic(fn);
    },
    quit(): void {
      quit();
    },
  };

  function render(): void {
    if (suspended || !running) return;
    const { rows, cols } = size();
    const active = nativeViews[view];
    const tabs = getAppTabs();
    const chrome = resolveChromeLayout(rows);
    const header = renderHeader(tabs, view, cols, chrome.headerLines);
    const footer = renderFooter(
      view,
      cols,
      tabs.length,
      active?.footerHint?.(tabs.length, cols),
      chrome.footerLines,
    );
    const body = active?.render(ctx) ?? [];
    const bodyScroll = active?.capturesInput?.() ? Number.MAX_SAFE_INTEGER : scroll;
    const lines = composeFrameLines(header, body, footer, rows, cols, bodyScroll);
    const patch = diffFrame(painted?.cols === cols ? painted.lines : undefined, lines);
    painted = { cols, lines };
    if (patch) process.stdout.write(patch);
  }

  function dispatchKey(key: string): void {
    if (key === '\x03') {
      process.exitCode = 130;
      quit();
      return;
    } // Ctrl-C always quits, even mid-capture.
    const active = nativeViews[view];
    if (active?.capturesInput?.() && key !== '\x1b') {
      active.handleKey?.(key, ctx);
      render();
      return;
    }
    const g = routeGlobalKey(key, viewIds, view);
    if (g.quit) {
      quit();
      return;
    }
    if (g.back) {
      if (active?.handleBack?.(ctx)) {
        scroll = 0; // the new sub-view's content height has nothing to do with the old one's
        render();
        return;
      }
      view = 'home';
      loadView('home');
      render();
      return;
    }
    if (g.switchTo) {
      switchTo(g.switchTo);
      return;
    }
    if (g.scrollBy) {
      if (active?.capturesPageKeys?.()) {
        active.handleKey?.(key, ctx);
        scroll = 0;
        render();
        return;
      }
      const page = Math.max(1, ctx.bodyRows - 2);
      scroll = Math.max(0, scroll + g.scrollBy * page);
      render();
      return;
    }
    active?.handleKey?.(key, ctx);
    render();
  }

  function dispatchKeys(keys: readonly string[]): void {
    for (let index = 0; index < keys.length && running && !suspended; index += 1) {
      let key = keys[index];
      if (key === undefined) continue;

      if (nativeViews[view]?.capturesInput?.() && isPrintableKey(key)) {
        while (index + 1 < keys.length) {
          const next = keys[index + 1];
          if (next === undefined || !isPrintableKey(next)) break;
          key += next;
          index += 1;
        }
      }
      dispatchKey(key);
    }
  }

  function scheduleClock(): void {
    if (!running) return;
    clockTimer = setTimeout(
      () => {
        clockTimer = undefined;
        render();
        scheduleClock();
      },
      60_000 - (Date.now() % 60_000),
    );
  }

  function clearKeyFlush(): void {
    if (keyFlushTimer === undefined) return;
    clearTimeout(keyFlushTimer);
    keyFlushTimer = undefined;
  }

  function onKey(data: Buffer): void {
    clearKeyFlush();
    dispatchKeys(keyDecoder.write(data));
    if (!running || suspended || !keyDecoder.hasPending) return;
    keyFlushTimer = setTimeout(() => {
      keyFlushTimer = undefined;
      dispatchKeys(keyDecoder.flush());
    }, 20);
  }

  function enter(): void {
    if (entered || lifecycle.signal.aborted) return;
    entered = true;
    painted = undefined;
    keyDecoder.reset();
    ensureCursorRestored();
    try {
      process.stdout.write(ansi.enterAlt + ansi.hideCursor);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', onKey);
    } catch (error) {
      leave();
      throw error;
    }
  }

  function leave(): void {
    if (!entered) return;
    entered = false;
    clearKeyFlush();
    keyDecoder.reset();
    process.stdin.removeListener('data', onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(ansi.showCursor + ansi.leaveAlt);
    process.stdin.pause();
  }

  function switchTo(id: ViewId): void {
    scroll = 0;
    view = id;
    loadView(id);
    render();
  }

  async function runClassic(fn: () => Promise<void>): Promise<void> {
    suspended = true;
    leave();
    try {
      await fn();
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    }
    if (!running) return;
    enter();
    suspended = false;
    render();
  }

  function onResize(): void {
    render();
  }

  function onExit(): void {
    leave();
  }

  function onSigint(): void {
    process.exitCode = 130;
    quit();
  }

  function onSigterm(): void {
    process.exitCode = 143;
    quit();
  }

  function onSighup(): void {
    process.exitCode = 129;
    quit();
  }

  let resolveRun: () => void;
  const done = new Promise<void>((resolve) => {
    resolveRun = resolve;
  });

  function quit(): void {
    if (!running) return;
    running = false;
    lifecycle.abort();
    if (clockTimer !== undefined) {
      clearTimeout(clockTimer);
      clockTimer = undefined;
    }
    try {
      leave();
    } finally {
      process.stdout.removeListener('resize', onResize);
      process.removeListener('exit', onExit);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGHUP', onSighup);
      resolveRun();
    }
  }

  process.on('exit', onExit);
  process.stdout.on('resize', onResize);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  process.once('SIGHUP', onSighup);

  try {
    enter();
    loadView('home');
    render();
    scheduleClock();
    await done;
  } finally {
    quit();
    await Promise.allSettled(
      Object.values(nativeViews).map(async (target) => {
        await target.dispose?.();
      }),
    );
  }
}
