import { ansi, ensureCursorRestored } from '../core/canvas.js';
import { composeFrame, computeBodyRows } from './frame.js';
import { routeGlobalKey, type ViewId } from './keys.js';
import { renderHeader, renderFooter, HEADER_LINES, FOOTER_LINES } from './chrome.js';
import type { AppContext, AppSize, View } from './view.js';
import { homeView } from './views/home.js';
import { scheduleView } from './views/schedule.js';
import { docsView } from './views/docs.js';
import { eventsView } from './views/events.js';
import { settingsView } from './views/settings.js';
import { t } from '../i18n/index.js';

/**
 * Event-driven full-screen app loop. Owns the alt-screen + raw-mode lifecycle
 * and composes every tab as a native `View` rendered in place. `ctx.runClassic`
 * remains as a scoped escape hatch a view can call itself when a single action
 * genuinely needs the real terminal (e.g. Docs handing off to glow/less to
 * read a file) — the app loop no longer dispatches whole tabs through it.
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

  // Every tab is a native View rendered in place inside the alt-screen frame.
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
    schedule: scheduleView,
    docs: docsView,
    events: eventsView,
    settings: settingsView,
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
    // Esc always reaches global routing, even while a view "captures" input
    // for a focused field (login/search text entry). Without this carve-out,
    // a view whose own Esc-handling doesn't escape its captured mode would
    // trap the user on that tab with no way out except Ctrl-C (quitting the
    // whole app). Esc must never be swallowed silently — it's the universal
    // way out of anything.
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
      view = 'home';
      void nativeViews['home']?.load?.(ctx)?.catch(() => {});
      render();
      return;
    }
    if (g.switchTo) {
      switchTo(g.switchTo);
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
    // `enter()` calls `stdin.resume()`; a resumed stdin stream keeps the
    // Node event loop alive by design even with no listeners attached. The
    // classic bridge calls `enter()` again right after, so pausing here is
    // always safe — either it's about to be resumed, or the app is quitting
    // for good and this is what lets the process actually exit.
    process.stdin.pause();
  }

  function switchTo(id: ViewId): void {
    scroll = 0;
    view = id;
    void nativeViews[id]?.load?.(ctx)?.catch(() => {});
    render();
  }

  // A classic surface (currently only Docs' glow/less pager) owns its own
  // raw-mode + rendering, so the app must fully leave() the alt-screen
  // before invoking it and re-enter() after it returns.
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
