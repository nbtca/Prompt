import { ansi, ensureCursorRestored } from '../core/canvas.js';
import { composeFrame, computeBodyRows } from './frame.js';
import { routeGlobalKey, type ViewId } from './keys.js';
import { renderHeader, renderFooter, HEADER_LINES, FOOTER_LINES } from './chrome.js';
import type { AppContext, AppSize, View } from './view.js';
import { homeView } from './views/home.js';
import { t } from '../i18n/index.js';
import { showCalendar } from '../features/calendar.js';
import { showSchedule } from '../features/schedule-view.js';
import { showDocsMenu } from '../features/docs.js';
import { showSettingsMenu } from '../features/settings.js';

/**
 * Event-driven full-screen app loop. Owns the alt-screen + raw-mode lifecycle
 * and composes the native `home` view with a "classic bridge" that suspends
 * the app to run the pre-existing menu-driven surfaces for the other tabs.
 *
 * Resolves once the user quits (q / Ctrl+C / Esc from home). Terminal state
 * (alt-screen, raw mode, cursor) is always restored before this resolves,
 * on SIGINT, on process exit, and even if an unexpected error is thrown.
 */
export async function runApp(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  let view: ViewId = 'home';
  let scroll = 0;
  let running = true;
  let suspended = false;

  // A focused student companion: schedule-first, no infra-status/links noise.
  const tabs: { id: ViewId; title: string }[] = [
    { id: 'home', title: 'Home' },
    { id: 'schedule', title: t().timetable.menuEntry },
    { id: 'events', title: t().menu.events },
    { id: 'docs', title: t().menu.docs },
    { id: 'settings', title: t().menu.settings },
  ];
  const viewIds = tabs.map((tab) => tab.id);

  // Views rendered natively inside the alt-screen frame. Anything not listed
  // here but present in `classicFor` still suspends the app and runs the old
  // menu-driven surface.
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
  };

  const classicFor: Partial<Record<ViewId, () => Promise<void>>> = {
    schedule: showSchedule,
    events: showCalendar,
    docs: showDocsMenu,
    settings: showSettingsMenu,
  };

  function size(): AppSize {
    return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
  }

  const ctx: AppContext = {
    get size(): AppSize { return size(); },
    get bodyRows(): number { return computeBodyRows(size().rows, HEADER_LINES, FOOTER_LINES); },
    rerender(): void { render(); },
    runClassic(fn: () => Promise<void>): Promise<void> { return runClassic(fn); },
    quit(): void { quit(); },
  };

  function render(): void {
    if (suspended || !running) return;
    const { rows, cols } = size();
    const header = renderHeader(tabs, view, cols);
    const footer = renderFooter(view, cols);
    const body = nativeViews[view]?.render(ctx) ?? [];
    process.stdout.write(ansi.home + composeFrame(header, body, footer, rows, cols, scroll) + ansi.eraseDown);
  }

  function onKey(data: Buffer): void {
    const key = data.toString();
    if (key === '\x03') { quit(); return; } // Ctrl-C always quits, even mid-capture.
    const active = nativeViews[view];
    if (active?.capturesInput?.()) {
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
      view = 'home';
      void nativeViews['home']?.load?.(ctx)?.catch(() => {});
      render();
      return;
    }
    if (g.switchTo) {
      void switchTo(g.switchTo);
      return;
    }
    active?.handleKey?.(key, ctx);
    render();
  }

  function enter(): void {
    ensureCursorRestored();
    process.stdout.write(ansi.enterAlt + ansi.hideCursor);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onKey);
  }

  function leave(): void {
    process.stdin.removeListener('data', onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(ansi.showCursor + ansi.leaveAlt);
  }

  async function switchTo(id: ViewId): Promise<void> {
    scroll = 0;
    const classic = classicFor[id];
    if (classic) {
      await runClassic(classic);
      view = 'home';
      void nativeViews['home']?.load?.(ctx)?.catch(() => {});
      render();
    } else {
      view = id;
      void nativeViews[id]?.load?.(ctx)?.catch(() => {});
      render();
    }
  }

  // Classic surfaces (calendar, schedule, status, docs, links, settings) own
  // their own raw-mode + rendering, so the app must fully leave() the
  // alt-screen before invoking them and re-enter() after they return.
  async function runClassic(fn: () => Promise<void>): Promise<void> {
    suspended = true;
    leave();
    try {
      await fn();
    } catch (err) {
      // Classic surfaces are expected to surface their own errors, but if
      // one throws anyway, don't swallow it silently: leave() has already
      // restored cooked mode, so writing to stderr here is visible.
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    }
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
    quit();
    process.exit(0);
  }

  let resolveRun: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveRun = resolve;
  });

  function quit(): void {
    if (!running) return;
    running = false;
    try {
      leave();
    } finally {
      process.stdout.removeListener('resize', onResize);
      process.removeListener('exit', onExit);
      process.removeListener('SIGINT', onSigint);
      resolveRun();
    }
  }

  process.on('exit', onExit);
  process.stdout.on('resize', onResize);
  process.once('SIGINT', onSigint);

  try {
    enter();
    void nativeViews['home']?.load?.(ctx)?.catch(() => {});
    render();
    await done;
  } finally {
    // Safety net: if we got here via an unexpected throw rather than quit(),
    // make sure the terminal is restored and listeners don't leak.
    if (running) quit();
  }
}
