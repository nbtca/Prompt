export type ViewId = 'home' | 'events' | 'schedule' | 'docs' | 'status' | 'links' | 'settings';

export interface GlobalKeyResult {
  switchTo?: ViewId;
  back?: boolean;
  quit?: boolean;
  /** -1 (PageUp) or +1 (PageDown): scroll the whole body by one page.
   * A view's own field (a ListField's internal list) already owns
   * up/down/Home/End for its own options — PageUp/PageDown are free,
   * non-conflicting keys for scrolling body *content* that overflows the
   * viewport outside of any field (e.g. a heatmap + activity briefing
   * taller than the terminal). */
  scrollBy?: -1 | 1;
  handled: boolean;
}

export function routeGlobalKey(key: string, viewIds: readonly ViewId[], current: ViewId): GlobalKeyResult {
  if (key === 'q' || key === '\x03') return { quit: true, handled: true };
  if (key === '\x1b') return current === 'home' ? { quit: true, handled: true } : { back: true, handled: true };
  if (key === '\t') {
    const i = viewIds.indexOf(current);
    return { switchTo: viewIds[(i + 1) % viewIds.length], handled: true };
  }
  if (key === '\x1b[5~') return { scrollBy: -1, handled: true };
  if (key === '\x1b[6~') return { scrollBy: 1, handled: true };
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx < viewIds.length) return { switchTo: viewIds[idx], handled: true };
  }
  return { handled: false };
}
