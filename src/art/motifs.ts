import chalk from 'chalk';
import { gasGiantLines, moonLines, tint } from './planet.js';
import { getCapabilities } from '../core/capabilities.js';
import { pictureMode, type PictureMode } from '../core/pixel-art.js';

type Vec = readonly [number, number, number];

const RAMP = '.-:=+*xo#%&@';
const ROWS = 6;
const MOON_COLS = 12;
const MOON_AT = 7;
const WIDTH = 22;
const STAR_PALE: Vec = [200, 212, 255];
const STAR_WARM: Vec = [255, 226, 150];
const STARS: readonly (readonly [number, number, string, Vec])[] = [
  [1, 1, '*', STAR_WARM],
  [4, 0, '.', STAR_PALE],
  [3, 3, '+', STAR_PALE],
  [0, 5, '.', STAR_PALE],
  [6, 4, '.', STAR_WARM],
  [MOON_AT + MOON_COLS + 1, 1, '.', STAR_PALE],
  [MOON_AT + MOON_COLS + 2, 3, '*', STAR_WARM],
  [MOON_AT + MOON_COLS, 5, '.', STAR_PALE],
];

const plain = (mode: PictureMode): boolean => mode === 'tone';

/** A crescent moon among a few stars: nothing is happening tonight. */
export function moonSky(mode: PictureMode = pictureMode()): string[] {
  const waning = new Date(Date.UTC(2000, 0, 6, 18, 14) + 21.5 * 86_400_000);
  const moon = moonLines(MOON_COLS, waning, mode === 'fine' ? 'color' : mode) ?? [];
  return Array.from({ length: ROWS }, (_, row) => {
    const cells = new Map(
      STARS.filter(([, starRow]) => starRow === row).map(([col, , char, color]) => [
        col,
        plain(mode) ? char : chalk.rgb(...color)(char),
      ]),
    );
    const moonLine = moon[row] ?? '';
    const moonWidth = Math.max(
      0,
      ...moon.map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').length),
    );
    let line = '';
    for (let col = 0; col < MOON_AT; col++) line += cells.get(col) ?? ' ';
    line += moonLine;
    const visible = moonLine.replace(/\x1b\[[0-9;]*m/g, '').length;
    line += ' '.repeat(Math.max(0, moonWidth - visible));
    for (let col = MOON_AT + moonWidth; col < WIDTH; col++) line += cells.get(col) ?? ' ';
    return line.replace(/\s+$/, '');
  });
}

const GLASS: Vec = [125, 211, 252];
const HANDLE: Vec = [245, 158, 11];
const LENS = { x: 5.6, y: 5.4, radius: 5.1, rim: 1.25 };

/** A magnifying glass with a rim lit from the upper left and a glint on the glass. */
export function magnifier(mode: PictureMode = pictureMode()): string[] {
  const handleFrom = {
    x: LENS.x + LENS.radius * 0.72,
    y: LENS.y + LENS.radius * 0.72,
  };
  const handleTo = { x: handleFrom.x + 4.2, y: handleFrom.y + 3.2 };
  const segment = { x: handleTo.x - handleFrom.x, y: handleTo.y - handleFrom.y };
  const length = segment.x ** 2 + segment.y ** 2;
  return Array.from({ length: ROWS }, (_, row) => {
    let line = '';
    for (let col = 0; col < 14; col++) {
      const x = col + 0.5;
      const y = (row + 0.5) * 2;
      const dx = x - LENS.x;
      const dy = y - LENS.y;
      const dist = Math.hypot(dx, dy);
      const along = Math.max(
        0,
        Math.min(1, ((x - handleFrom.x) * segment.x + (y - handleFrom.y) * segment.y) / length),
      );
      const handleDist = Math.hypot(
        x - (handleFrom.x + along * segment.x),
        y - (handleFrom.y + along * segment.y),
      );
      let char = ' ';
      let color = GLASS;
      let level = 0;
      if (Math.abs(dist - LENS.radius) < LENS.rim) {
        const facing = (-dx - dy) / (dist * Math.SQRT2 || 1);
        level = 0.62 + 0.38 * facing;
        char = RAMP[Math.min(RAMP.length - 1, Math.max(6, Math.floor(level * RAMP.length)))] ?? '+';
      } else if (handleDist < 1.2 && dist > LENS.radius) {
        char = '\\';
        color = HANDLE;
        level = 0.55;
      } else if (dist < LENS.radius) {
        const glint = Math.max(0, 1 - Math.hypot(x - (LENS.x - 1.9), y - (LENS.y - 1.9)) / 2.2);
        if (glint > 0.2) {
          level = glint;
          char = RAMP[Math.min(5, Math.floor(glint * 6))] ?? '.';
          color = [226, 242, 255];
        }
      }
      line += char === ' ' || plain(mode) ? char : tint(color, level, char);
    }
    return line.replace(/\s+$/, '');
  });
}

const ANSI = /(?:\x1b\[[0-9;]*m)*[^\x1b](?:\x1b\[[0-9;]*m)*/gu;
const ORBIT = {
  cols: 22,
  centre: { x: 11, y: 3 },
  radiusX: 10,
  radiusY: 2.3,
  period: 3200,
  spin: 6400,
};
const MOON_ON_ORBIT: Vec = [226, 232, 240];
const ORBIT_TRAIL: Vec = [71, 85, 105];

/** A small planet with a moon circling it; the moon moves one step per frame. */
export function orbit(at: number, mode: PictureMode = pictureMode()): string[] {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: ORBIT.cols }, () => ' '));
  const place = (x: number, y: number, cell: string) => {
    const row = grid[y];
    if (row && x >= 0 && x < ORBIT.cols) row[x] = cell;
  };
  const dot = (angle: number, cell: string) => {
    place(
      Math.round(ORBIT.centre.x + ORBIT.radiusX * Math.cos(angle)),
      Math.round(ORBIT.centre.y - 0.5 + ORBIT.radiusY * Math.sin(angle)),
      cell,
    );
  };
  const trail = plain(mode) ? '.' : chalk.rgb(...ORBIT_TRAIL)('.');
  for (let step = 0; step < 24; step++) dot((step / 24) * 2 * Math.PI, trail);

  const turn = (at / ORBIT.spin) * 2 * Math.PI;
  const planet = gasGiantLines(8, mode === 'fine' ? 'color' : mode, turn) ?? [];
  planet.forEach((line, index) => {
    (line.match(ANSI) ?? []).forEach((cell, col) => {
      if (cell.replace(/\x1b\[[0-9;]*m/g, '') !== ' ') place(7 + col, 1 + index, cell);
    });
  });

  const angle = ((at % ORBIT.period) / ORBIT.period) * 2 * Math.PI;
  const x = Math.round(ORBIT.centre.x + ORBIT.radiusX * Math.cos(angle));
  const y = Math.round(ORBIT.centre.y - 0.5 + ORBIT.radiusY * Math.sin(angle));
  const behind = Math.sin(angle) < 0 && grid[y]?.[x] !== ' ' && x > 6 && x < 15 && y > 0 && y < 5;
  if (!behind) place(x, y, plain(mode) ? 'o' : chalk.rgb(...MOON_ON_ORBIT)('o'));
  return grid.map((row) => row.join('').replace(/\s+$/, ''));
}

const STEEL: Vec = [148, 163, 184];
const WAVE: Vec = [71, 85, 105];
const LOST: Vec = [248, 113, 113];
const TOWER: readonly (readonly [string, Vec | undefined])[][] = [
  [['        x', LOST]],
  [
    ['   .  (  ', WAVE],
    ['|', STEEL],
    ['  )  .', WAVE],
  ],
  [
    ['  . ( ( ', WAVE],
    ['/|\\', STEEL],
    [' ) ) .', WAVE],
  ],
  [
    ['        ', undefined],
    ['/|\\', STEEL],
  ],
  [
    ['       ', undefined],
    ['/ | \\', STEEL],
  ],
  [
    ['      ', undefined],
    ['/__|__\\', STEEL],
  ],
];

/** A transmitter whose signal has dropped: dim waves and a red cross above the mast. */
export function signalLost(mode: PictureMode = pictureMode()): string[] {
  return TOWER.map((parts) =>
    parts
      .map(([text, color]) => (plain(mode) || !color ? text : chalk.rgb(...color)(text)))
      .join('')
      .replace(/\s+$/, ''),
  );
}

const PORCELAIN: Vec = [226, 232, 240];
const TEA: Vec = [217, 119, 6];
const STEAM: Vec = [148, 163, 184];
const STEAM_FRAMES: readonly (readonly [string, string])[] = [
  ['   )  (   ) ', '  (  )  (   '],
  ['  (  )   (  ', '   )  (  )  '],
  ['   (  )  (  ', '  )  (   )  '],
  ['  )   (  )  ', '   (  )  (  '],
];
const STEAM_MS = 500;
const CUP: readonly (readonly [string, Vec])[][] = [
  [[' ,---------.', PORCELAIN]],
  [
    [' |', PORCELAIN],
    ['~~~~~~~~~', TEA],
    ['|', PORCELAIN],
    ['-.', PORCELAIN],
  ],
  [[' |         | |', PORCELAIN]],
  [["  \\_______/-'", PORCELAIN]],
];

/** A cup of tea with drifting steam: a day without classes. */
export function teaCup(at: number, mode: PictureMode = pictureMode()): string[] {
  const frame = getCapabilities().reducedMotion
    ? 0
    : Math.floor(at / STEAM_MS) % STEAM_FRAMES.length;
  const steam = (STEAM_FRAMES[frame] ?? STEAM_FRAMES[0] ?? ['', '']).map((line) =>
    plain(mode) ? line : chalk.rgb(...STEAM)(line),
  );
  const cup = CUP.map((parts) =>
    parts.map(([text, color]) => (plain(mode) ? text : chalk.rgb(...color)(text))).join(''),
  );
  return [...steam, ...cup].map((line) => line.replace(/\s+$/, ''));
}
