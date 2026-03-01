/**
 * Vim keybindings support
 * Maps j/k/g/G/q to arrow keys and actions in clack menus.
 */

type KeyEvent = { name: string; shift?: boolean; ctrl?: boolean; meta?: boolean; [k: string]: unknown };

const KEY_MAP: Array<{ match: (k: KeyEvent) => boolean; mapped: Partial<KeyEvent> }> = [
  { match: k => k.name === 'j' && !k.ctrl && !k.meta,            mapped: { name: 'down' } },
  { match: k => k.name === 'k' && !k.ctrl && !k.meta,            mapped: { name: 'up' } },
  { match: k => k.name === 'g' && !k.shift && !k.ctrl && !k.meta, mapped: { name: 'home' } },
  { match: k => k.name === 'g' && !!k.shift && !k.ctrl && !k.meta, mapped: { name: 'end' } },
  { match: k => k.name === 'q' && !k.ctrl && !k.meta,            mapped: { name: 'c', ctrl: true } },
];

export function enableVimKeys(): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return;

  const originalEmit = stdin.emit.bind(stdin);

  (stdin.emit as any) = function (event: string, ...args: any[]) {
    if (event === 'keypress') {
      const key: KeyEvent = args[1];
      if (key?.name) {
        const mapping = KEY_MAP.find(m => m.match(key));
        if (mapping) return originalEmit('keypress', null, mapping.mapped);
      }
    }
    return originalEmit(event, ...args);
  };
}
