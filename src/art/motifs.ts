import chalk from 'chalk';
import { moonLines, tint } from './planet.js';
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
