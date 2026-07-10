const CSI = '\x1b[';

export const ansi = {
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  eraseDown: `${CSI}0J`,
  cursorToCol0: '\r',
  cursorUp: (n: number): string => (n > 0 ? `${CSI}${n}A` : ''),
};

let registered = false;

export function ensureCursorRestored(): void {
  if (registered) return;
  registered = true;
  const restore = () => {
    if (process.stdout.isTTY) process.stdout.write(ansi.showCursor);
  };
  process.on('exit', restore);
  process.on('SIGINT', () => {
    restore();
    process.exit(0);
  });
}
