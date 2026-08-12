const VIM_TO_SEQ: Record<string, Buffer> = {
  j: Buffer.from('\u001b[B'),
  k: Buffer.from('\u001b[A'),
  l: Buffer.from('\r'),
  g: Buffer.from('\u001b[H'),
  G: Buffer.from('\u001b[F'),
};

type StreamEmit = (event: string | symbol, ...args: unknown[]) => boolean;

let vimActive = true;

export function setVimKeysActive(active: boolean): void {
  vimActive = active;
}

function vimKeysAreActive(): boolean {
  return vimActive;
}

function utf8Length(chunk: Buffer, start: number): number | null {
  const first = chunk[start] ?? 0;
  const length =
    first <= 0x7f
      ? 1
      : first >= 0xc2 && first <= 0xdf
        ? 2
        : first >= 0xe0 && first <= 0xef
          ? 3
          : first >= 0xf0 && first <= 0xf4
            ? 4
            : 1;
  if (start + length > chunk.length) return null;
  for (let index = start + 1; index < start + length; index += 1) {
    const byte = chunk[index] ?? 0;
    if (byte < 0x80 || byte > 0xbf) return 1;
  }
  return length;
}

function escapeLength(chunk: Buffer, start: number): number | null {
  const introducer = chunk[start + 1];
  if (introducer === undefined) return null;
  if (introducer === 0x1b || introducer <= 0x1f || introducer === 0x7f) return 1;

  if (introducer === 0x5b || introducer === 0x4f) {
    for (let index = start + 2; index < chunk.length; index += 1) {
      const byte = chunk[index] ?? 0;
      if (byte >= 0x40 && byte <= 0x7e) return index - start + 1;
      if (byte < 0x20 || byte > 0x3f) return 1;
    }
    return null;
  }

  if ([0x5d, 0x50, 0x5e, 0x5f].includes(introducer)) {
    for (let index = start + 2; index < chunk.length; index += 1) {
      if (chunk[index] === 0x07) return index - start + 1;
      if (chunk[index] === 0x1b && chunk[index + 1] === 0x5c) return index - start + 2;
    }
    return null;
  }

  const length = utf8Length(chunk, start + 1);
  return length === null ? null : length + 1;
}

function keyLength(chunk: Buffer, start: number): number | null {
  return chunk[start] === 0x1b ? escapeLength(chunk, start) : utf8Length(chunk, start);
}

function concatBuffers(chunks: readonly Buffer[]): Buffer {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = Buffer.allocUnsafe(size);
  let offset = 0;
  for (const chunk of chunks) {
    for (const byte of chunk) {
      result[offset] = byte;
      offset += 1;
    }
  }
  return result;
}

class KeyByteFramer {
  private pending = Buffer.alloc(0);

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  write(chunk: Buffer): Buffer[] {
    this.pending = this.pending.length === 0 ? chunk : concatBuffers([this.pending, chunk]);
    return this.drain(false);
  }

  flush(): Buffer[] {
    return this.drain(true);
  }

  takePending(): Buffer {
    const pending = this.pending;
    this.pending = Buffer.alloc(0);
    return pending;
  }

  private drain(flush: boolean): Buffer[] {
    const keys: Buffer[] = [];
    let offset = 0;
    while (offset < this.pending.length) {
      const length = keyLength(this.pending, offset);
      if (length === null) {
        if (flush) {
          keys.push(this.pending.subarray(offset));
          offset = this.pending.length;
        }
        break;
      }
      keys.push(this.pending.subarray(offset, offset + length));
      offset += length;
    }
    this.pending = this.pending.subarray(offset);
    return keys;
  }
}

export function enableVimKeys(): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return;

  const originalEmit: StreamEmit = stdin.emit.bind(stdin);
  const framer = new KeyByteFramer();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const clearFlush = () => {
    if (flushTimer === undefined) return;
    clearTimeout(flushTimer);
    flushTimer = undefined;
  };

  const emitKeys = (keys: readonly Buffer[]): boolean => {
    let emitted = false;
    for (let index = 0; index < keys.length; index += 1) {
      if (!vimKeysAreActive()) {
        emitted = originalEmit('data', concatBuffers(keys.slice(index))) || emitted;
        return emitted;
      }

      const key = keys[index];
      if (key === undefined) continue;
      const sequence = key.length === 1 ? VIM_TO_SEQ[String.fromCharCode(key[0] ?? 0)] : undefined;
      emitted = originalEmit('data', sequence ?? key) || emitted;
    }
    return emitted;
  };

  const scheduleFlush = () => {
    if (!framer.hasPending) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      if (!vimKeysAreActive()) {
        originalEmit('data', framer.takePending());
        return;
      }
      emitKeys(framer.flush());
    }, 20);
  };

  const translatedEmit: StreamEmit = (event, ...args) => {
    if (event === 'data') {
      const chunk = args[0];
      if (Buffer.isBuffer(chunk)) {
        clearFlush();
        if (!vimKeysAreActive()) {
          const pending = framer.takePending();
          return pending.length === 0
            ? originalEmit(event, ...args)
            : originalEmit('data', concatBuffers([pending, chunk]));
        }
        const emitted = emitKeys(framer.write(chunk));
        scheduleFlush();
        return emitted;
      }
    }
    return originalEmit(event, ...args);
  };
  stdin.emit = translatedEmit as typeof stdin.emit;
}
