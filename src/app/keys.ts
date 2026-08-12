export type ViewId = 'home' | 'events' | 'schedule' | 'docs' | 'status' | 'links' | 'settings';

export interface GlobalKeyResult {
  switchTo?: ViewId;
  back?: boolean;
  quit?: boolean;
  scrollBy?: -1 | 1;
  handled: boolean;
}

function switchResult(target: ViewId | undefined): GlobalKeyResult {
  return target === undefined ? { handled: true } : { switchTo: target, handled: true };
}

export function routeGlobalKey(
  key: string,
  viewIds: readonly ViewId[],
  current: ViewId,
): GlobalKeyResult {
  if (key === 'q' || key === '\x03') return { quit: true, handled: true };
  if (key === '\x1b')
    return current === 'home' ? { quit: true, handled: true } : { back: true, handled: true };
  if (key === '\t') {
    const i = viewIds.indexOf(current);
    return switchResult(viewIds[(i + 1) % viewIds.length]);
  }
  if (key === '\x1b[Z') {
    const i = viewIds.indexOf(current);
    const previous = i < 0 ? viewIds.length - 1 : (i - 1 + viewIds.length) % viewIds.length;
    return switchResult(viewIds[previous]);
  }
  if (key === '\x1b[5~') return { scrollBy: -1, handled: true };
  if (key === '\x1b[6~') return { scrollBy: 1, handled: true };
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx < viewIds.length) return switchResult(viewIds[idx]);
  }
  return { handled: false };
}
