const CSI = '\x1b[';

export const ansi = {
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  eraseDown: `${CSI}0J`,
  cursorToCol0: '\r',
  cursorUp: (n: number): string => (n > 0 ? `${CSI}${n}A` : ''),
  enterAlt: `${CSI}?1049h`,
  leaveAlt: `${CSI}?1049l`,
  home: `${CSI}H`,
  clearAll: `${CSI}2J`,
};

let registered = false;

export function ensureCursorRestored(): void {
  if (registered) return;
  registered = true;
  const restore = () => {
    if (process.stdout.isTTY) process.stdout.write(ansi.showCursor);
  };
  process.on('exit', restore);
}
