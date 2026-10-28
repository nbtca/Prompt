import type { Bitmap } from '../core/pixel-art.js';

type Rgb = [number, number, number];

const SYMBOLS = Array.from({ length: 94 }, (_, index) => String.fromCharCode(0x21 + index));

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as Rgb;
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex(
    [0, 1, 2].map((index) => (a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * t) as Rgb,
  );
}

class Canvas {
  readonly cells: (string | null)[][];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = Array.from({ length: height }, () => Array<string | null>(width).fill(null));
  }
  set(x: number, y: number, color: string | null): void {
    const col = Math.round(x);
    const row = Math.round(y);
    const line = this.cells[row];
    if (line && col >= 0 && col < this.width) line[col] = color;
  }
  rect(x0: number, y0: number, x1: number, y1: number, color: string): void {
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, color);
    }
  }
  disc(
    cx: number,
    cy: number,
    radius: number,
    color: (x: number, y: number) => string | null,
  ): void {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (Math.hypot(x - cx, y - cy) <= radius) {
          const value = color(x, y);
          if (value !== null) this.set(x, y, value);
        }
      }
    }
  }
  toBitmap(): Bitmap {
    const palette: Record<string, string> = {};
    const symbols = new Map<string, string>();
    const rows = this.cells.map((row) =>
      row
        .map((color) => {
          if (color === null) return ' ';
          let symbol = symbols.get(color);
          if (symbol === undefined) {
            symbol = SYMBOLS[symbols.size] ?? SYMBOLS.at(-1) ?? '!';
            symbols.set(color, symbol);
            palette[symbol] = color;
          }
          return symbol;
        })
        .join(''),
    );
    return { palette, rows };
  }
}

function random(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// [hour, sky at the top, sky at the horizon]
const SKY: readonly (readonly [number, string, string])[] = [
  [0, '#050b1e', '#0b1a3a'],
  [5, '#0b1a3a', '#3b2a5a'],
  [6.5, '#3a4a8a', '#f08a5a'],
  [9, '#2f78c8', '#9fd3ff'],
  [13, '#1d6fb8', '#8fcbff'],
  [17, '#2a5fa8', '#f2b36a'],
  [18.5, '#4a3a8a', '#f07a5a'],
  [20, '#0b1a3a', '#4a3a7a'],
  [22, '#050b1e', '#0b1a3a'],
  [24, '#050b1e', '#0b1a3a'],
];

function skyColors(hour: number): { top: string; horizon: string } {
  const after = SKY.findIndex(([at]) => at >= hour);
  const next = SKY[Math.max(1, after)] ?? SKY[SKY.length - 1];
  const prev = SKY[Math.max(0, after - 1)] ?? SKY[0];
  if (!next || !prev) return { top: '#050b1e', horizon: '#0b1a3a' };
  const amount = (hour - prev[0]) / (next[0] - prev[0] || 1);
  return { top: mix(prev[1], next[1], amount), horizon: mix(prev[2], next[2], amount) };
}

const isNight = (hour: number): boolean => hour < 5.5 || hour >= 19.5;

function drawSky(c: Canvas, horizon: number, hour: number, seed: number): void {
  const { top, horizon: low } = skyColors(hour);
  for (let y = 0; y < horizon; y++)
    c.rect(0, y, c.width - 1, y, mix(top, low, y / Math.max(1, horizon - 1)));
  const rand = random(seed);
  if (isNight(hour) || hour < 6.5 || hour > 18.5) {
    const strength = isNight(hour) ? 1 : 0.4;
    const count = Math.round(c.width * horizon * 0.03 * strength);
    for (let index = 0; index < count; index++) {
      const bright = rand() > 0.7;
      c.set(rand() * c.width, rand() * horizon * 0.85, bright ? '#f8fafc' : '#9fb4d8');
    }
  }
  const clouds = Math.max(2, Math.round(c.width / 14));
  for (let index = 0; index < clouds; index++) {
    const y = Math.round(horizon * (0.25 + rand() * 0.55));
    const x = rand() * c.width;
    const length = Math.round(c.width * (0.08 + rand() * 0.14));
    const color = mix(mix(top, low, y / horizon), isNight(hour) ? '#23366a' : '#ffffff', 0.35);
    c.rect(x, y, Math.min(c.width - 1, x + length), y, color);
    c.rect(x + length * 0.2, y - 1, x + length * 0.7, y - 1, color);
  }
}

function drawBody(c: Canvas, horizon: number, hour: number): { x: number; above: boolean } {
  const night = isNight(hour) || hour < 6 || hour >= 18;
  const t = night ? (((hour + 6) % 24) % 12) / 12 : (hour - 6) / 12;
  const cx = c.width * (0.1 + 0.8 * t);
  const cy = horizon - Math.sin(Math.PI * t) * horizon * 0.78;
  const radius = Math.max(2, c.height * 0.1);
  const glow = night ? '#3b4f8a' : '#f2a65e';
  const core = night ? '#e8eefc' : '#ffd27a';
  c.disc(cx, cy, radius * 1.45, (_x, y) => (y < horizon ? glow : null));
  c.disc(cx, cy, radius, (_x, y) => (y < horizon ? core : null));
  if (night)
    c.disc(cx + radius * 0.45, cy - radius * 0.2, radius * 0.8, (_x, y) =>
      y < horizon ? skyColors(hour).top : null,
    );
  return { x: cx, above: cy < horizon };
}

function drawSea(
  c: Canvas,
  horizon: number,
  hour: number,
  seed: number,
  body: { x: number; above: boolean },
): void {
  const { top, horizon: low } = skyColors(hour);
  const shallow = mix(low, '#1f2c55', 0.6);
  const deep = mix(top, '#050d1c', 0.7);
  for (let y = horizon; y < c.height; y++)
    c.rect(
      0,
      y,
      c.width - 1,
      y,
      mix(shallow, deep, (y - horizon) / Math.max(1, c.height - horizon - 1)),
    );
  const rand = random(seed + 3);
  const glint = isNight(hour) ? '#c9d6f5' : '#f0b266';
  if (body.above) {
    for (let y = horizon + 1; y < c.height - 1; y++) {
      if ((y - horizon) % 2 === 0) continue;
      const half = Math.max(
        1,
        Math.round(c.width * 0.12 * (1 - (y - horizon) / (c.height - horizon + 2))),
      );
      c.rect(
        body.x - half,
        y,
        body.x + half,
        y,
        mix(glint, deep, (y - horizon) / (c.height - horizon)),
      );
    }
  }
  const waves = Math.round(c.width * (c.height - horizon) * 0.05);
  for (let index = 0; index < waves; index++) {
    const y = horizon + 1 + Math.floor(rand() * (c.height - horizon - 2));
    const x = rand() * c.width;
    c.rect(x, y, x + 1 + Math.floor(rand() * 2), y, mix(shallow, '#ffffff', 0.12));
  }
}

function drawShore(c: Canvas, horizon: number, hour: number): void {
  const shade = isNight(hour) ? '#02060f' : '#050d1c';
  const bump = (from: number, to: number, peak: number, mid: number, spread: number) => {
    for (let x = Math.round(from * c.width); x < Math.round(to * c.width); x++) {
      const h = Math.round(
        peak * Math.exp(-Math.pow((x - mid * c.width) / (spread * c.width), 2)) + 1,
      );
      c.rect(x, horizon - h + 1, x, horizon, shade);
    }
  };
  bump(0, 0.36, horizon * 0.34, 0.15, 0.11);
  bump(0.66, 1, horizon * 0.24, 0.87, 0.1);
  const tx = Math.round(c.width * 0.85);
  const top = Math.round(horizon - horizon * 0.34);
  c.rect(tx, top, tx + 1, horizon - 3, shade);
  c.rect(tx - 1, top + Math.round(horizon * 0.14), tx + 2, top + Math.round(horizon * 0.14), shade);
  const lamp = isNight(hour) || hour < 6 || hour > 18 ? '#ffe08a' : '#8a6a3a';
  c.rect(tx, top - 1, tx + 1, top - 1, lamp);
  if (c.width >= 40) {
    for (let step = 0; step < 3; step++) c.set(tx + 2 + step * 2, top - 1 - step, lamp);
  }
  c.rect(0, c.height - 2, c.width - 1, c.height - 1, shade);
}

/** A seascape whose sky, sun or moon, stars, and lamp follow the hour of the day. */
export function skyScene(width: number, height: number, hour: number): Bitmap {
  const c = new Canvas(width, height);
  const horizon = Math.round(height * 0.58);
  drawSky(c, horizon, hour, 11);
  const body = drawBody(c, horizon, hour);
  drawSea(c, horizon, hour, 11, body);
  drawShore(c, horizon, hour);
  return c.toBitmap();
}

/** A ridge with a flag that climbs it as `progress` goes from 0 to 1. */
export function mountainScene(
  width: number,
  height: number,
  progress: number,
  hour: number,
): Bitmap {
  const c = new Canvas(width, height);
  const base = height - 2;
  const { top, horizon: low } = skyColors(Math.min(17, Math.max(8, hour)));
  for (let y = 0; y < height; y++) c.rect(0, y, width - 1, y, mix(top, low, y / height));
  const rand = random(5);
  for (let index = 0; index < Math.max(2, Math.round(width / 12)); index++) {
    const y = Math.round(height * (0.15 + rand() * 0.4));
    const x = rand() * width;
    c.rect(x, y, x + width * 0.1, y, mix(mix(top, low, y / height), '#ffffff', 0.4));
  }
  const ridge = (x: number, scale: number, phase: number) =>
    base -
    height *
      scale *
      (0.55 + 0.45 * Math.sin((x / width) * Math.PI * 2.2 + phase)) *
      Math.sin((x / width) * Math.PI) ** 0.6;
  const far = mix(low, '#2b3768', 0.6);
  const near = '#0b1630';
  for (let x = 0; x < width; x++) c.rect(x, ridge(x, 0.62, 1.4), x, base + 1, far);
  const top2 = (x: number) => ridge(x, 0.5, 0);
  for (let x = 0; x < width; x++) c.rect(x, top2(x), x, base + 1, near);
  const fx = Math.round(width * (0.12 + 0.76 * Math.min(1, Math.max(0, progress))));
  for (let x = Math.round(width * 0.12); x < fx; x += 2) c.set(x, top2(x) - 1, '#f8d98a');
  const fy = Math.round(top2(fx));
  const pole = Math.max(3, Math.round(height * 0.2));
  c.rect(fx, fy - pole, fx, fy - 1, '#e2e8f0');
  const flag = Math.max(2, Math.round(pole * 0.6));
  for (let row = 0; row < Math.ceil(flag / 2); row++)
    c.rect(fx + 1, fy - pole + row, fx + flag - row * 2, fy - pole + row, '#f59e0b');
  c.rect(0, base + 1, width - 1, height - 1, '#050d1c');
  return c.toBitmap();
}

/** A bookcase whose books get more numerous and more varied as the space grows. */
export function shelfScene(width: number, height: number): Bitmap {
  const c = new Canvas(width, height);
  const wood = '#2a1d14';
  const back = '#140e0a';
  c.rect(0, 0, width - 1, height - 1, back);
  const rand = random(23);
  const shelfHeight = Math.max(6, Math.round(height / Math.max(2, Math.round(height / 9))));
  const spines = [
    '#0ea5e9',
    '#06b6d4',
    '#bae6fd',
    '#f59e0b',
    '#fb7185',
    '#a78bfa',
    '#4ade80',
    '#94a3b8',
  ];
  for (let top = 0; top + shelfHeight <= height; top += shelfHeight) {
    const floor = top + shelfHeight - 1;
    c.rect(0, floor, width - 1, floor, wood);
    let x = 1;
    while (x < width - 2) {
      const gap = rand() > 0.9 ? Math.round(1 + rand() * 3) : 0;
      x += gap;
      const bookWidth = 2 + Math.floor(rand() * 3);
      const bookHeight = Math.round((shelfHeight - 2) * (0.6 + rand() * 0.4));
      if (x + bookWidth >= width - 1) break;
      const color = spines[Math.floor(rand() * spines.length)] ?? '#0ea5e9';
      c.rect(x, floor - bookHeight, x + bookWidth - 1, floor - 1, color);
      if (bookHeight >= 5)
        c.rect(
          x,
          floor - bookHeight + 2,
          x + bookWidth - 1,
          floor - bookHeight + 2,
          mix(color, '#ffffff', 0.45),
        );
      if (bookHeight >= 7 && bookWidth >= 3)
        c.rect(x, floor - 3, x + bookWidth - 1, floor - 3, mix(color, '#000000', 0.35));
      x += bookWidth;
    }
  }
  c.rect(0, 0, 0, height - 1, wood);
  c.rect(width - 1, 0, width - 1, height - 1, wood);
  return c.toBitmap();
}

/** Enlarges a bitmap by whole pixels so a small icon can fill a roomy window. */
export function scaleBitmap(bitmap: Bitmap, factor: number): Bitmap {
  const rows = bitmap.rows.flatMap((row) => {
    const wide = Array.from(row, (symbol) => symbol.repeat(factor)).join('');
    return Array.from({ length: factor }, () => wide);
  });
  return { palette: bitmap.palette, rows };
}
