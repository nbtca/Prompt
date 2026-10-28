import chalk from 'chalk';
import { fbm3, worley3 } from './noise.js';
import { moonPhase } from './scene.js';
import { pictureMode, type PictureMode } from '../core/pixel-art.js';

type Vec = readonly [number, number, number];

// Light to dark ink, as in classic tone-shaded ASCII spheres.
const RAMP = '.-:=+*xo#%&@';
const MIN_COLS = 8;
const MAX_COLS = 44;

interface Surface {
  /** Brightness multiplier of the surface material. */
  albedo: number;
  /** Colour of fully lit surface. */
  color: Vec;
  /** Perturbed normal, when the surface has relief. */
  normal?: Vec;
}

interface Sphere {
  light: Vec;
  /** The surface at a point of the unit sphere. */
  sample: (point: Vec) => Surface;
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
  const surface = sphere.sample([x, y, z]);
  const [nx, ny, nz] = surface.normal ?? [x, y, z];
  const lit = Math.max(0, nx * sphere.light[0] + ny * sphere.light[1] + nz * sphere.light[2]);
  return { level: Math.min(1, lit * surface.albedo * (0.55 + 0.45 * z)), color: surface.color };
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

const smoothstep = (low: number, high: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** The point as the texture sees it: turned about the vertical axis. */
function turned([x, y, z]: Vec, angle: number): Vec {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

const EPSILON = 0.03;
const RELIEF = 0.9;

/**
 * Bumps a unit sphere's normal by the slope of a height field, as bump mapping does: the field's gradient,
 * with its component along the normal removed, tilts the normal away from rising ground.
 */
function bumped(point: Vec, height: (p: Vec) => number): Vec {
  const base = height(point);
  const gradient: Vec = [
    (height([point[0] + EPSILON, point[1], point[2]]) - base) / EPSILON,
    (height([point[0], point[1] + EPSILON, point[2]]) - base) / EPSILON,
    (height([point[0], point[1], point[2] + EPSILON]) - base) / EPSILON,
  ];
  const along = gradient[0] * point[0] + gradient[1] * point[1] + gradient[2] * point[2];
  return normalize([
    point[0] - RELIEF * (gradient[0] - along * point[0]),
    point[1] - RELIEF * (gradient[1] - along * point[1]),
    point[2] - RELIEF * (gradient[2] - along * point[2]),
  ]);
}

const CRATER = 0.34;

/** Crater bowls with raised rims over rolling highlands. */
function lunarHeight(p: Vec, turn: number): number {
  const q = turned(p, turn);
  const scaled: Vec = [q[0] * 1.7, q[1] * 1.7, q[2] * 1.7];
  const d = worley3(scaled, 7);
  const bowl = -Math.pow(Math.max(0, 1 - d / CRATER), 0.7) * 0.38;
  const rim = Math.exp(-(((d - CRATER) / 0.06) ** 2)) * 0.2;
  return bowl + rim + fbm3([q[0] * 3, q[1] * 3, q[2] * 3], 3, 3) * 0.12;
}

/** The moon at today's phase, lit from the side the real moon is lit from. */
export function moonLines(
  cols: number,
  now: Date,
  mode = pictureMode(),
  turn = 0.9,
): string[] | undefined {
  if (cols < MIN_COLS) return undefined;
  const angle = 2 * Math.PI * moonPhase(now);
  return drawSphere(
    Math.min(cols, MAX_COLS),
    {
      light: normalize([Math.sin(angle), -0.12, -Math.cos(angle)]),
      sample: (point) => {
        const q = turned(point, turn);
        const maria = smoothstep(0.42, 0.6, fbm3([q[0] * 1.3, q[1] * 1.3, q[2] * 1.3], 3, 11));
        return {
          albedo: 1 - 0.38 * maria,
          color: [236, 238, 246],
          normal: bumped(point, (p) => lunarHeight(p, turn)),
        };
      },
    },
    mode,
  );
}

const STORM = { lon: 0.55, lat: 0.34, width: 0.5, height: 0.15 };

/** A banded gas giant lit from the upper left, with turbulent bands and a storm that turns with it. */
export function gasGiantLines(
  cols: number,
  mode = pictureMode(),
  turn = 0.9,
): string[] | undefined {
  if (cols < MIN_COLS) return undefined;
  return drawSphere(
    Math.min(cols, MAX_COLS),
    {
      light: normalize([-0.6, -0.45, 0.66]),
      sample: (point) => {
        const q = turned(point, turn);
        const turbulence = fbm3([q[0] * 2.4, q[1] * 9, q[2] * 2.4], 3, 5);
        const band = 0.5 + 0.5 * Math.sin(q[1] * 11 + turbulence * 3.2);
        const lon = Math.atan2(q[0], q[2]);
        const spread = Math.cos(Math.asin(Math.max(-1, Math.min(1, q[1]))));
        const dLon = ((lon - STORM.lon + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const storm = Math.exp(
          -(((dLon * spread) / STORM.width) ** 2) - ((q[1] - STORM.lat) / STORM.height) ** 2,
        );
        const base: Vec = [236 - 40 * band, 176 - 30 * band, 120 + 40 * band];
        const spot: Vec = [214, 92, 66];
        return {
          albedo: 0.82 + 0.18 * band + 0.1 * storm,
          color: [
            base[0] + (spot[0] - base[0]) * storm,
            base[1] + (spot[1] - base[1]) * storm,
            base[2] + (spot[2] - base[2]) * storm,
          ],
        };
      },
    },
    mode,
  );
}

export const planetSize = (cols: number, rows: number): number =>
  Math.min(MAX_COLS, cols, rows * 2);
