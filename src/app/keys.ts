export type ViewId = 'home' | 'events' | 'schedule' | 'docs' | 'status' | 'links' | 'settings';

export interface GlobalKeyResult {
  switchTo?: ViewId;
  back?: boolean;
  quit?: boolean;
  scrollBy?: -1 | 1;
  scrollLines?: -1 | 1;
  scrollTo?: 'top' | 'end';
  handled: boolean;
}

const ESC = '\x1b';
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function isControl(value: string): boolean {
  const code = value.charCodeAt(0);
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

export function isPrintableKey(value: string): boolean {
  if (value.length === 0 || value.startsWith(ESC)) return false;
  return Array.from(value).every((char) => !isControl(char));
}

function escapeSequenceLength(value: string): number | null {
  if (value.length === 1) return null;

  const introducer = value[1];
  if (introducer === ESC || (introducer !== undefined && isControl(introducer))) return 1;

  if (introducer === '[' || introducer === 'O') {
    for (let index = 2; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) return index + 1;
      if (code < 0x20 || code > 0x3f) return 1;
    }
    return null;
  }

  if (introducer === ']' || introducer === 'P' || introducer === '^' || introducer === '_') {
    for (let index = 2; index < value.length; index += 1) {
      if (value[index] === '\x07') return index + 1;
      if (value[index] === ESC && value[index + 1] === '\\') return index + 2;
    }
    return null;
  }

  const segment = GRAPHEME_SEGMENTER.segment(value.slice(1))[Symbol.iterator]().next();
  return segment.done ? null : 1 + segment.value.segment.length;
}

export class KeyStreamDecoder {
  private decoder = new TextDecoder();
  private pending = '';

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  write(data: Buffer | string): string[] {
    this.pending += typeof data === 'string' ? data : this.decoder.decode(data, { stream: true });
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  reset(): void {
    this.pending = '';
    this.decoder = new TextDecoder();
  }

  private drain(flush: boolean): string[] {
    const keys: string[] = [];
    let offset = 0;

    while (offset < this.pending.length) {
      const value = this.pending.slice(offset);
      const first = value[0];
      if (first === undefined) break;

      if (first === ESC) {
        const length = escapeSequenceLength(value);
        if (length === null) {
          if (flush) {
            keys.push(value);
            offset = this.pending.length;
          }
          break;
        }
        keys.push(value.slice(0, length));
        offset += length;
        continue;
      }

      if (isControl(first)) {
        keys.push(first);
        offset += 1;
        continue;
      }

      let end = offset;
      while (end < this.pending.length) {
        const char = this.pending[end];
        if (char === undefined || char === ESC || isControl(char)) break;
        end += char.length;
      }

      const run = this.pending.slice(offset, end);
      const segments = Array.from(GRAPHEME_SEGMENTER.segment(run), ({ segment }) => segment);
      for (const segment of segments) {
        keys.push(segment);
        offset += segment.length;
      }
    }

    this.pending = this.pending.slice(offset);
    return keys;
  }
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
  if (key === '\x1b[6~' || key === ' ') return { scrollBy: 1, handled: true };
  if (key === '\x1b[A') return { scrollLines: -1, handled: true };
  if (key === '\x1b[B') return { scrollLines: 1, handled: true };
  if (key === '\x1b[H') return { scrollTo: 'top', handled: true };
  if (key === '\x1b[F') return { scrollTo: 'end', handled: true };
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx < viewIds.length) return switchResult(viewIds[idx]);
  }
  return { handled: false };
}
