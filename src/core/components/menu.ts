export type MenuKey = 'up' | 'down' | 'home' | 'end' | 'enter' | 'cancel' | 'none';

export function parseKey(data: Buffer | string): MenuKey {
  const s = data.toString();
  switch (s) {
    case '\x1b[A': return 'up';
    case '\x1b[B': return 'down';
    case '\x1b[H': return 'home';
    case '\x1b[F': return 'end';
    case '\r':
    case '\n': return 'enter';
    case '\x03':
    case '\x1b': return 'cancel';
    default: return 'none';
  }
}

export function nextIndex(current: number, key: MenuKey, len: number): number {
  if (len <= 0) return 0;
  switch (key) {
    case 'up': return (current - 1 + len) % len;
    case 'down': return (current + 1) % len;
    case 'home': return 0;
    case 'end': return len - 1;
    default: return current;
  }
}
