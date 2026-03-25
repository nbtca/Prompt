/**
 * Vim keybindings support
 * Intercepts raw data events and replaces vim keys with terminal escape sequences
 * before readline processes them. This avoids patching the keypress layer which
 * breaks in Node.js v25+ (emitKeys generator crash).
 */

// Maps single-byte vim keys to terminal escape sequences (ranger-style hjkl)
const VIM_TO_SEQ: Record<string, Buffer> = {
  h: Buffer.from('\u0003'),   // back/cancel (ranger: go to parent)
  j: Buffer.from('\u001b[B'), // down arrow
  k: Buffer.from('\u001b[A'), // up arrow
  l: Buffer.from('\r'),       // enter/confirm (ranger: open/enter)
  g: Buffer.from('\u001b[H'), // home (first item)
  G: Buffer.from('\u001b[F'), // end (last item)
  q: Buffer.from('\u0003'),   // quit
};

export function enableVimKeys(): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return;

  const originalEmit = stdin.emit.bind(stdin);

  (stdin.emit as any) = function (event: string, ...args: any[]) {
    if (event === 'data') {
      const chunk = args[0];
      if (Buffer.isBuffer(chunk) && chunk.length === 1) {
        const seq = VIM_TO_SEQ[String.fromCharCode(chunk[0] as number)];
        if (seq) return originalEmit('data', seq);
      }
    }
    return originalEmit(event, ...args);
  };
}
