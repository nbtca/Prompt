import chalk from 'chalk';
import { moonPhase } from './scene.js';
import { pictureMode, type PictureMode } from '../core/pixel-art.js';

type Vec = readonly [number, number, number];

// Light to dark ink, as in classic tone-shaded ASCII spheres.
const RAMP = '.-:=+*xo#%&@';
const MIN_COLS = 12;
const MAX_COLS = 44;

interface Sphere {
  light: Vec;
  /** Brightness multiplier at a point on the surface, in -1..1 sphere coordinates. */
  surface: (x: number, y: number) => number;
  /** Colour of fully lit surface at that point. */
  color: (x: number, y: number) => Vec;
}

const normalize = (v: Vec): Vec => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

function drawSphere(cols: number, sphere: Sphere, mode: PictureMode): string[] {
  const rows = Math.round(cols / 2);
  const colour = mode !== 'tone';
  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const x = ((col + 0.5) / cols) * 2 - 1;
      const y = ((row + 0.5) / rows) * 2 - 1;
      const radius = x * x + y * y;
      if (radius > 1) {
        line += ' ';
        continue;
      }
      const z = Math.sqrt(1 - radius);
      const lit = Math.max(0, x * sphere.light[0] + y * sphere.light[1] + z * sphere.light[2]);
      const level = Math.min(1, lit * sphere.surface(x, y) * (0.55 + 0.45 * z));
      if (level < 0.02) {
        line += colour ? chalk.rgb(48, 54, 70)('.') : ' ';
        continue;
      }
      const char = RAMP[Math.min(RAMP.length - 1, Math.floor(level * RAMP.length))] ?? ' ';
      if (!colour) {
        line += char;
        continue;
      }
      const [r, g, b] = sphere.color(x, y);
      const gain = 0.62 + 0.38 * level;
      line += chalk.rgb(Math.round(r * gain), Math.round(g * gain), Math.round(b * gain))(char);
    }
    return line.replace(/\s+$/, '');
  });
}

const MARIA: readonly (readonly [number, number, number])[] = [
  [-0.3, -0.25, 0.28],
  [0.25, -0.1, 0.22],
  [-0.05, 0.4, 0.2],
  [0.45, 0.35, 0.12],
];

/** The moon at today's phase, lit from the side the real moon is lit from. */
export function moonLines(cols: number, now: Date, mode = pictureMode()): string[] | undefined {
  if (cols < MIN_COLS) return undefined;
  const angle = 2 * Math.PI * moonPhase(now);
  const light = normalize([Math.sin(angle), -0.12, -Math.cos(angle)]);
  return drawSphere(
    Math.min(cols, MAX_COLS),
    {
      light,
      surface: (x, y) => {
        const dark = MARIA.reduce(
          (sum, [mx, my, size]) =>
            sum + Math.max(0, 1 - Math.hypot(x - mx, (y - my) * 1.1) / size) * 0.3,
          0,
        );
        return 1 - Math.min(0.35, dark);
      },
      color: () => [236, 238, 246],
    },
    mode,
  );
}

/** A banded gas giant lit from the upper left. */
export function gasGiantLines(cols: number, mode = pictureMode()): string[] | undefined {
  if (cols < MIN_COLS) return undefined;
  return drawSphere(
    Math.min(cols, MAX_COLS),
    {
      light: normalize([-0.6, -0.45, 0.66]),
      surface: (x, y) => 0.88 + 0.12 * Math.sin(y * 11 + Math.sin(x * 3 + y * 2) * 0.9),
      color: (_, y) => {
        const band = 0.5 + 0.5 * Math.sin(y * 7 + 1);
        return [236 - 40 * band, 176 - 30 * band, 120 + 40 * band];
      },
    },
    mode,
  );
}

export const planetSize = (cols: number, rows: number): number =>
  Math.min(MAX_COLS, cols, rows * 2);
