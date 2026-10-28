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

interface Shade {
  level: number;
  color: Vec;
}

const normalize = (v: Vec): Vec => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

function shadeAt(sphere: Sphere, x: number, y: number): Shade | undefined {
  const radius = x * x + y * y;
  if (radius > 1) return undefined;
  const z = Math.sqrt(1 - radius);
  const lit = Math.max(0, x * sphere.light[0] + y * sphere.light[1] + z * sphere.light[2]);
  return {
    level: Math.min(1, lit * sphere.surface(x, y) * (0.55 + 0.45 * z)),
    color: sphere.color(x, y),
  };
}

const NIGHT: Vec = [48, 54, 70];

export function tint(color: Vec, level: number, char: string): string {
  const gain = 0.62 + 0.38 * level;
  return chalk.rgb(
    Math.round(color[0] * gain),
    Math.round(color[1] * gain),
    Math.round(color[2] * gain),
  )(char);
}

function drawSphere(cols: number, sphere: Sphere, mode: PictureMode): string[] {
  if (mode === 'fine') return drawFineSphere(cols, sphere);
  const rows = Math.round(cols / 2);
  const colour = mode !== 'tone';
  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const shade = shadeAt(sphere, ((col + 0.5) / cols) * 2 - 1, ((row + 0.5) / rows) * 2 - 1);
      if (!shade) {
        line += ' ';
        continue;
      }
      if (shade.level < 0.02) {
        line += colour ? chalk.rgb(...NIGHT)('.') : ' ';
        continue;
      }
      const char = RAMP[Math.min(RAMP.length - 1, Math.floor(shade.level * RAMP.length))] ?? ' ';
      line += colour ? tint(shade.color, shade.level, char) : char;
    }
    return line.replace(/\s+$/, '');
  });
}

const SUPERSAMPLE = 3;
const EDGE_COVERAGE = 0.4;

/** One truecolor pixel of the sphere, antialiased at the rim; undefined outside it. */
function fineColor(sphere: Sphere, cols: number, px: number, py: number): Vec | undefined {
  const size = cols;
  let covered = 0;
  const sum: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < SUPERSAMPLE; i++) {
    for (let j = 0; j < SUPERSAMPLE; j++) {
      const x = ((px + (i + 0.5) / SUPERSAMPLE) / size) * 2 - 1;
      const y = ((py + (j + 0.5) / SUPERSAMPLE) / size) * 2 - 1;
      const shade = shadeAt(sphere, x, y);
      if (!shade) continue;
      covered++;
      const bright = Math.pow(shade.level, 0.75);
      for (let channel = 0; channel < 3; channel++)
        sum[channel] =
          (sum[channel] ?? 0) +
          (NIGHT[channel] ?? 0) * 0.6 * (1 - bright) +
          (shade.color[channel] ?? 0) * bright;
    }
  }
  if (covered < EDGE_COVERAGE * SUPERSAMPLE ** 2) return undefined;
  return [sum[0] / covered, sum[1] / covered, sum[2] / covered];
}

/** Half blocks with a smoothly shaded colour on each half: twice the character resolution, no dithering. */
function drawFineSphere(cols: number, sphere: Sphere): string[] {
  const rows = Math.round(cols / 2);
  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const top = fineColor(sphere, cols, col, row * 2);
      const bottom = fineColor(sphere, cols, col, row * 2 + 1);
      const rgb = (v: Vec) => [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])] as const;
      if (top && bottom) line += chalk.rgb(...rgb(top)).bgRgb(...rgb(bottom))('▀');
      else if (top) line += chalk.rgb(...rgb(top))('▀');
      else if (bottom) line += chalk.rgb(...rgb(bottom))('▄');
      else line += ' ';
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
