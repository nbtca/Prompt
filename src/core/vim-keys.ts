const VIM_TO_SEQ: Record<string, Buffer> = {
  j: Buffer.from('\u001b[B'),
  k: Buffer.from('\u001b[A'),
  l: Buffer.from('\r'),
  g: Buffer.from('\u001b[H'),
  G: Buffer.from('\u001b[F'),
  q: Buffer.from('\u0003'),
};

type StreamEmit = (event: string | symbol, ...args: unknown[]) => boolean;

let vimActive = true;

export function setVimKeysActive(active: boolean): void {
  vimActive = active;
}

export function enableVimKeys(): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return;

  const originalEmit: StreamEmit = stdin.emit.bind(stdin);

  const translatedEmit: StreamEmit = (event, ...args) => {
    if (event === 'data' && vimActive) {
      const chunk = args[0];
      if (Buffer.isBuffer(chunk) && chunk.length === 1) {
        const seq = VIM_TO_SEQ[String.fromCharCode(chunk.readUInt8(0))];
        if (seq) return originalEmit('data', seq);
      }
    }
    return originalEmit(event, ...args);
  };
  stdin.emit = translatedEmit as typeof stdin.emit;
}
