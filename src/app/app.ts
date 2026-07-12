import { ansi } from '../core/canvas.js';
import { composeFrame } from './frame.js';
import { routeGlobalKey, type ViewId } from './keys.js';
import { renderHeader, renderFooter } from './chrome.js';
import type { AppContext, AppSize } from './view.js';
import { homeView } from './views/home.js';
import { t } from '../i18n/index.js';
import { showCalendar } from '../features/calendar.js';
import { showSchedule } from '../features/schedule-view.js';
import { showServiceStatus } from '../features/status.js';
import { showDocsMenu } from '../features/docs.js';
import { showLinksMenu } from '../features/links.js';
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

  const tabs: { id: ViewId; title: string }[] = [
    { id: 'home', title: 'Home' },
    { id: 'events', title: t().menu.events },
    { id: 'schedule', title: t().timetable.menuEntry },
    { id: 'docs', title: t().menu.docs },
    { id: 'status', title: t().menu.status },
    { id: 'links', title: t().menu.links },
    { id: 'settings', title: t().menu.settings },
  ];
  const viewIds = tabs.map((tab) => tab.id);

  // Only `home` is a native View; the rest suspend the app and run the
  // existing classic (non-alt-screen) surface, then return to home.
  const classicFor: Partial<Record<ViewId, () => Promise<void>>> = {
    events: showCalendar,
    schedule: showSchedule,
    status: async () => { await showServiceStatus(); },
    docs: showDocsMenu,
    links: showLinksMenu,
    settings: showSettingsMenu,
  };

  function size(): AppSize {
    return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
  }

  const ctx: AppContext = {
    get size(): AppSize { return size(); },
    rerender(): void { render(); },
    runClassic(fn: () => Promise<void>): Promise<void> { return runClassic(fn); },
    quit(): void { quit(); },
  };

  function render(): void {
    const { rows, cols } = size();
    const header = renderHeader(tabs, view, cols);
    const footer = renderFooter(view, cols);
    const body = view === 'home' ? homeView.render(ctx) : [];
    process.stdout.write(ansi.home + composeFrame(header, body, footer, rows, cols, scroll));
  }

  function onKey(data: Buffer): void {
    const key = data.toString();
    const g = routeGlobalKey(key, viewIds, view);
    if (g.quit) {
      quit();
      return;
    }
    if (g.back) {
      view = 'home';
      void homeView.load?.(ctx);
      render();
      return;
    }
    if (g.switchTo) {
      void switchTo(g.switchTo);
      return;
    }
    if (view === 'home') {
      homeView.handleKey?.(key, ctx);
      render();
    }
  }

  function enter(): void {
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
    view = id;
    scroll = 0;
    const classic = classicFor[id];
    if (classic) {
      await runClassic(classic);
      view = 'home';
      void homeView.load?.(ctx);
      render();
    } else {
      void homeView.load?.(ctx);
      render();
    }
  }

  // Classic surfaces (calendar, schedule, status, docs, links, settings) own
  // their own raw-mode + rendering, so the app must fully leave() the
  // alt-screen before invoking them and re-enter() after they return.
  async function runClassic(fn: () => Promise<void>): Promise<void> {
    leave();
    try {
      await fn();
    } catch {
      // Classic surfaces are responsible for surfacing their own errors.
    }
    enter();
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
    process.stdout.removeListener('resize', onResize);
    process.removeListener('exit', onExit);
    process.removeListener('SIGINT', onSigint);
    leave();
    resolveRun();
  }

  process.on('exit', onExit);
  process.stdout.on('resize', onResize);
  process.once('SIGINT', onSigint);

  try {
    enter();
    void homeView.load?.(ctx);
    render();
    await done;
  } finally {
    // Safety net: if we got here via an unexpected throw rather than quit(),
    // make sure the terminal is restored and listeners don't leak.
    if (running) quit();
  }
}
