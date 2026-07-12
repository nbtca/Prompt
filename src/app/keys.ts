export type ViewId = 'home' | 'events' | 'schedule' | 'docs' | 'status' | 'links' | 'settings';

export interface GlobalKeyResult {
  switchTo?: ViewId;
  back?: boolean;
  quit?: boolean;
  handled: boolean;
}

export function routeGlobalKey(key: string, viewIds: readonly ViewId[], current: ViewId): GlobalKeyResult {
  if (key === 'q' || key === '\x03') return { quit: true, handled: true };
  if (key === '\x1b') return current === 'home' ? { quit: true, handled: true } : { back: true, handled: true };
  if (key === '\t') {
    const i = viewIds.indexOf(current);
    return { switchTo: viewIds[(i + 1) % viewIds.length], handled: true };
  }
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx < viewIds.length) return { switchTo: viewIds[idx], handled: true };
  }
  return { handled: false };
}
