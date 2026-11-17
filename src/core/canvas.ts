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
  cursorToRow: (row: number): string => `${CSI}${row};1H`,
  clearAll: `${CSI}2J`,
  pushTitle: `${CSI}22;0t`,
  // Terminals without a title stack ignore the pop, so clear the title first.
  popTitle: `\x1b]0;\x07${CSI}23;0t`,
  title: (text: string): string => `\x1b]0;${text}\x07`,
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
