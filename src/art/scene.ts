import type { Bitmap } from '../core/pixel-art.js';

type Rgb = [number, number, number];

const ASCII_SYMBOLS = Array.from({ length: 94 }, (_, index) => String.fromCharCode(0x21 + index));
const FINE = { x: 2, y: 4 } as const;

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
  get(x: number, y: number): string | null {
    return this.cells[Math.round(y)]?.[Math.round(x)] ?? null;
  }
  set(x: number, y: number, color: string | null): void {
    const col = Math.round(x);
    const line = this.cells[Math.round(y)];
    if (line && col >= 0 && col < this.width) line[col] = color;
  }
  rect(x0: number, y0: number, x1: number, y1: number, color: string): void {
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, color);
    }
  }
  /** Paints a blob; the callback sees the distance from the centre, 0 at the middle and 1 at the rim. */
  blob(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    paint: (x: number, y: number, edge: number) => string | null,
  ): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const edge = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (edge <= 1) {
          const color = paint(x, y, edge);
          if (color !== null) this.set(x, y, color);
        }
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let step = 0; step <= steps; step++) {
      this.set(x0 + ((x1 - x0) * step) / steps, y0 + ((y1 - y0) * step) / steps, color);
    }
  }
  /** Softens the staircase along high-contrast edges so silhouettes read as smooth curves. */
  smoothEdges(): void {
    const luminance = (hex: string): number => {
      const [r, g, b] = hexToRgb(hex);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const next = this.cells.map((row) => [...row]);
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const self = this.cells[y]?.[x];
        if (!self) continue;
        const around = [
          this.get(x - 1, y),
          this.get(x + 1, y),
          this.get(x, y - 1),
          this.get(x, y + 1),
        ];
        const unlike = around.filter(
          (color): color is string =>
            color !== null && Math.abs(luminance(color) - luminance(self)) > 0.2,
        );
        const target = unlike[0];
        const row = next[y];
        if (unlike.length === 1 && target !== undefined && row) row[x] = mix(self, target, 0.35);
      }
    }
    for (let y = 0; y < this.height; y++) this.cells[y] = next[y] ?? [];
  }
  toBitmap(): Bitmap {
    this.smoothEdges();
    const palette: Record<string, string> = {};
    const symbols = new Map<string, string>();
    const rows = this.cells.map((row) =>
      row
        .map((color) => {
          if (color === null) return ' ';
          let symbol = symbols.get(color);
          if (symbol === undefined) {
            const index = symbols.size;
            symbol =
              ASCII_SYMBOLS[index] ?? String.fromCharCode(0x100 + index - ASCII_SYMBOLS.length);
            symbols.set(color, symbol);
            palette[symbol] = color;
          }
          return symbol;
        })
        .join(''),
    );
    return { palette, rows, density: FINE, smooth: true };
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

const isDark = (hour: number): boolean => hour < 6 || hour >= 18.5;

/** 0 is a new moon, 0.5 a full moon, counted from the new moon of 6 January 2000. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853;
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  return (((days / synodic) % 1) + 1) % 1;
}

function drawSky(c: Canvas, horizon: number, hour: number, rand: () => number): void {
  const { top, horizon: low } = skyColors(hour);
  for (let y = 0; y < horizon; y++)
    c.rect(0, y, c.width - 1, y, mix(top, low, (y / horizon) ** 1.4));
  if (isDark(hour) || hour < 7 || hour > 18) {
    const strength = isDark(hour) ? 1 : 0.35;
    const count = Math.round(c.width * horizon * 0.0016 * strength);
    for (let index = 0; index < count; index++) {
      const x = rand() * c.width;
      const y = rand() * horizon * 0.85;
      const bright = rand();
      c.set(x, y, bright > 0.85 ? '#ffffff' : bright > 0.4 ? '#c7d4ef' : '#7f93bf');
      if (bright > 0.95) {
        c.set(x - 1, y, '#8ea2cc');
        c.set(x + 1, y, '#8ea2cc');
        c.set(x, y - 1, '#8ea2cc');
        c.set(x, y + 1, '#8ea2cc');
      }
    }
  }
  const tint = isDark(hour) ? '#33487f' : hour > 16 || hour < 8 ? '#ffd9c2' : '#ffffff';
  for (let index = 0; index < Math.max(2, Math.round(c.width / 28)); index++) {
    const cx = rand() * c.width;
    const cy = horizon * (0.2 + rand() * 0.5);
    const rx = c.width * (0.05 + rand() * 0.07);
    const ry = Math.max(1.5, horizon * (0.025 + rand() * 0.03));
    c.blob(cx, cy, rx, ry, (x, y, edge) => mix(c.get(x, y) ?? low, tint, 0.5 * (1 - edge ** 2)));
    c.blob(cx - rx * 0.25, cy - ry * 0.7, rx * 0.5, ry * 0.8, (x, y, edge) =>
      mix(c.get(x, y) ?? low, tint, 0.45 * (1 - edge ** 2)),
    );
  }
  if (!isDark(hour)) {
    for (let index = 0; index < Math.round(c.width / 60); index++) {
      const x = c.width * (0.15 + rand() * 0.6);
      const y = horizon * (0.15 + rand() * 0.3);
      for (const side of [-1, 1]) c.line(x, y, x + side * 2, y - 1, '#1d2b4a');
    }
  }
}

function drawBody(
  c: Canvas,
  horizon: number,
  hour: number,
  date: Date,
): { x: number; above: boolean } {
  const night = hour < 6 || hour >= 18;
  const t = night ? (((hour + 6) % 24) % 12) / 12 : (hour - 6) / 12;
  const cx = c.width * (0.1 + 0.8 * t);
  const cy = horizon - Math.sin(Math.PI * t) * horizon * 0.8;
  const radius = Math.max(3, c.height * 0.055);
  const { horizon: low } = skyColors(hour);
  const glow = night ? '#3b4f8a' : '#f6b36a';
  c.blob(cx, cy, radius * 3.2, radius * 3.2, (x, y, edge) =>
    y < horizon ? mix(c.get(x, y) ?? low, glow, 0.5 * (1 - edge) ** 2) : null,
  );
  if (!night) {
    c.blob(cx, cy, radius, radius, (_x, y, edge) =>
      y < horizon ? mix('#fff1bd', '#ffc46b', edge ** 2) : null,
    );
    return { x: cx, above: cy < horizon };
  }
  const phase = moonPhase(date);
  const k = Math.cos(2 * Math.PI * phase);
  c.blob(cx, cy, radius, radius, (x, y) => {
    if (y >= horizon) return null;
    const nx = (x - cx) / radius;
    const ny = (y - cy) / radius;
    const half = Math.sqrt(Math.max(0, 1 - ny * ny));
    const lit = phase < 0.5 ? nx > k * half : nx < -k * half;
    return lit ? mix('#f4f7ff', '#c9d4ee', Math.hypot(nx, ny) ** 3) : '#141e3d';
  });
  return { x: cx, above: cy < horizon };
}

function drawSea(
  c: Canvas,
  horizon: number,
  hour: number,
  rand: () => number,
  body: { x: number; above: boolean },
): void {
  const { top, horizon: low } = skyColors(hour);
  const shallow = mix(low, '#1f2c55', 0.55);
  const deep = mix(top, '#050d1c', 0.75);
  const depth = c.height - horizon;
  for (let y = horizon; y < c.height; y++)
    c.rect(0, y, c.width - 1, y, mix(shallow, deep, ((y - horizon) / depth) ** 0.8));
  const glint = isDark(hour) ? '#dfe8ff' : '#ffd08a';
  if (body.above) {
    for (let y = horizon + 1; y < c.height - 2; y++) {
      const progress = (y - horizon) / depth;
      const half = Math.max(1, c.width * 0.07 * (1 - progress * 0.55));
      const wobble = Math.sin(y * 1.7) * c.width * 0.012;
      if (rand() < 0.35) continue;
      c.rect(
        body.x + wobble - half,
        y,
        body.x + wobble + half,
        y,
        mix(glint, deep, progress * 0.8),
      );
    }
  }
  const waves = Math.round(c.width * depth * 0.012);
  for (let index = 0; index < waves; index++) {
    const y = horizon + 1 + Math.floor(rand() * (depth - 3));
    const x = rand() * c.width;
    const length = 1 + Math.floor(rand() * 4) * (1 + (y - horizon) / depth);
    c.rect(x, y, x + length, y, mix(c.get(x, y) ?? shallow, '#ffffff', 0.12 + 0.1 * rand()));
  }
}

function drawShore(c: Canvas, horizon: number, hour: number, rand: () => number): void {
  const shade = isDark(hour) ? '#02060f' : '#06101f';
  const haze = mix(skyColors(hour).horizon, shade, 0.7);
  const lit = isDark(hour) || hour > 18 || hour < 6;
  let x = Math.round(c.width * 0.36);
  while (x < c.width * 0.62) {
    const w = 2 + Math.floor(rand() * 4);
    const h = Math.max(2, Math.round(horizon * (0.04 + rand() * 0.1)));
    c.rect(x, horizon - h, x + w - 1, horizon, haze);
    if (lit) {
      for (let wy = horizon - h + 1; wy < horizon - 1; wy += 2) {
        for (let wx = x + 1; wx < x + w - 1; wx += 2) if (rand() > 0.45) c.set(wx, wy, '#ffd27a');
      }
    }
    x += w + (rand() > 0.7 ? 1 : 0);
  }
  const bump = (
    from: number,
    to: number,
    peak: number,
    mid: number,
    spread: number,
    color: string,
  ) => {
    for (let px = Math.round(from * c.width); px < Math.round(to * c.width); px++) {
      const h = Math.round(
        peak * Math.exp(-(((px - mid * c.width) / (spread * c.width)) ** 2)) + 1,
      );
      c.rect(px, horizon - h + 1, px, horizon + 1, color);
    }
  };
  bump(0, 0.4, horizon * 0.3, 0.2, 0.14, mix(haze, shade, 0.45));
  bump(0, 0.3, horizon * 0.3, 0.1, 0.1, shade);
  bump(0.62, 1, horizon * 0.24, 0.9, 0.11, shade);
  const tx = Math.round(c.width * 0.9);
  const tower = Math.round(horizon * 0.3);
  const base = horizon - Math.round(horizon * 0.14);
  c.rect(tx, base - tower, tx + 2, base, shade);
  c.rect(tx - 1, base - tower, tx + 3, base - tower, shade);
  c.rect(tx, base - tower - 2, tx + 2, base - tower - 1, lit ? '#ffe08a' : '#8a6a3a');
  if (lit) {
    const reach = c.width * 0.3;
    for (let step = 1; step < reach; step++) {
      const spread = step * 0.12;
      for (let dy = -spread; dy <= spread; dy++) {
        const y = base - tower - 1 + dy;
        const cell = c.get(tx - step, y);
        if (cell !== null && y < horizon - 1)
          c.set(tx - step, y, mix(cell, '#ffe9a8', 0.1 * (1 - step / reach)));
      }
    }
  }
  const boatX = Math.round(c.width * 0.27);
  const boatY = horizon + Math.round((c.height - horizon) * 0.28);
  const size = Math.max(3, Math.round(c.width * 0.035));
  for (let dy = 0; dy < size; dy++) {
    c.rect(
      boatX,
      boatY - dy - 1,
      boatX + Math.round(size * 0.55) - Math.round(dy * 0.5),
      boatY - dy - 1,
      lit ? '#9fb0d6' : '#f1f5f9',
    );
  }
  c.rect(boatX - 1, boatY, boatX + size, boatY + 1, shade);
  c.rect(0, c.height - 3, c.width - 1, c.height - 1, shade);
}

/** A seascape whose sky, sun or moon (with its real phase), stars, city, and lighthouse follow the time. */
export function skyScene(width: number, height: number, now: Date): Bitmap {
  const hour = now.getHours() + now.getMinutes() / 60;
  const c = new Canvas(width, height);
  const horizon = Math.round(height * 0.62);
  const rand = random(11);
  drawSky(c, horizon, hour, rand);
  const body = drawBody(c, horizon, hour, now);
  drawSea(c, horizon, hour, rand, body);
  drawShore(c, horizon, hour, rand);
  return c.toBitmap();
}

/** Ridges with a trail and a flag that climbs it as `progress` goes from 0 to 1, one tick per week. */
export function mountainScene(
  width: number,
  height: number,
  progress: number,
  weeks: number,
  now: Date,
): Bitmap {
  const hour = Math.min(17, Math.max(8, now.getHours() + now.getMinutes() / 60));
  const c = new Canvas(width, height);
  const { top, horizon: low } = skyColors(hour);
  for (let y = 0; y < height; y++) c.rect(0, y, width - 1, y, mix(top, low, (y / height) ** 1.3));
  const rand = random(5);
  for (let index = 0; index < Math.max(2, Math.round(width / 28)); index++) {
    const cx = rand() * width;
    const cy = height * (0.1 + rand() * 0.35);
    const rx = width * (0.05 + rand() * 0.06);
    const ry = Math.max(1.5, height * 0.025);
    c.blob(cx, cy, rx, ry, (x, y, edge) =>
      mix(c.get(x, y) ?? low, '#ffffff', 0.5 * (1 - edge ** 2)),
    );
  }
  c.blob(width * 0.82, height * 0.2, height * 0.05, height * 0.05, (_x, _y, edge) =>
    mix('#fff4c9', '#ffd27a', edge ** 2),
  );
  const base = height - 3;
  const ridge = (x: number, scale: number, phase: number, rough: number) => {
    const u = x / width;
    const sway =
      0.55 +
      0.3 * Math.sin(u * Math.PI * 2.1 + phase) +
      0.15 * Math.sin(u * Math.PI * rough + phase * 2);
    return (
      base -
      height * scale * sway * Math.sin(Math.PI * Math.min(1, Math.max(0, u * 0.9 + 0.05))) ** 0.5
    );
  };
  const layers: [number, number, number, string][] = [
    [0.7, 1.4, 11, mix(low, '#3a4f86', 0.55)],
    [0.58, 3.1, 17, mix(low, '#1f3466', 0.7)],
    [0.46, 0, 23, '#0b1630'],
  ];
  for (const [scale, phase, rough, color] of layers) {
    for (let x = 0; x < width; x++) c.rect(x, ridge(x, scale, phase, rough), x, base + 2, color);
  }
  const near = (x: number) => ridge(x, 0.46, 0, 23);
  const start = Math.round(width * 0.1);
  const span = width * 0.8;
  const reached = Math.min(1, Math.max(0, progress));
  for (let x = start; x < start + span * reached; x += 2) c.set(x, near(x) - 1, '#f8d98a');
  for (let week = 0; week <= Math.max(1, weeks); week++) {
    const x = Math.round(start + (span * week) / Math.max(1, weeks));
    const past = week / Math.max(1, weeks) <= progress;
    c.rect(x, near(x) - 3, x, near(x) - 2, past ? '#f8d98a' : '#5b6f9e');
  }
  for (let index = 0; index < Math.round(width / 5); index++) {
    const x = Math.round(rand() * width);
    const y = Math.round(near(x));
    if (x > start - 4 && x < start + span + 4 && rand() > 0.4) continue;
    const h = 3 + Math.floor(rand() * 4);
    for (let row = 0; row < h; row++)
      c.rect(x - Math.floor(row / 2), y - h + row, x + Math.floor(row / 2), y - h + row, '#0a1f2a');
  }
  const fx = Math.round(start + span * reached);
  const fy = Math.round(near(fx));
  const pole = Math.max(5, Math.round(height * 0.2));
  c.rect(fx, fy - pole, fx, fy - 1, '#e2e8f0');
  const length = Math.max(3, Math.round(pole * 0.7));
  for (let row = 0; row < Math.ceil(length * 0.6); row++) {
    c.rect(
      fx + 1,
      fy - pole + row,
      fx + length - Math.round(row * 1.4),
      fy - pole + row,
      '#f59e0b',
    );
  }
  c.rect(0, base + 1, width - 1, height - 1, '#050d1c');
  return c.toBitmap();
}

/** A bookcase with a cat on the top shelf; more books and shelves appear as the space grows. */
export function shelfScene(width: number, height: number): Bitmap {
  const c = new Canvas(width, height);
  const wood = '#3a2718';
  const woodLight = '#5a3d27';
  const back = '#17100b';
  for (let y = 0; y < height; y++) c.rect(0, y, width - 1, y, mix('#1d140e', back, y / height));
  c.blob(width * 0.12, height * 0.2, width * 0.28, height * 0.55, (x, y, edge) =>
    mix(c.get(x, y) ?? back, '#ffb86b', 0.12 * (1 - edge)),
  );
  const rand = random(23);
  const shelfHeight = Math.max(14, Math.round(height / Math.max(2, Math.round(height / 22))));
  const spines = [
    '#0ea5e9',
    '#06b6d4',
    '#bae6fd',
    '#f59e0b',
    '#fb7185',
    '#a78bfa',
    '#4ade80',
    '#94a3b8',
    '#e11d48',
    '#2dd4bf',
  ];
  const catX = Math.round(width * 0.62);
  let shelfIndex = 0;
  for (let top = 0; top + shelfHeight <= height; top += shelfHeight, shelfIndex++) {
    const floor = top + shelfHeight - 2;
    c.rect(0, floor, width - 1, floor + 1, wood);
    c.rect(0, floor, width - 1, floor, woodLight);
    let x = 2;
    while (x < width - 3) {
      if (shelfIndex === 0 && x >= catX - 3 && x < catX + 16) {
        x = catX + 16;
        continue;
      }
      if (rand() > 0.93) x += 2 + Math.floor(rand() * 5);
      const bookWidth = 3 + Math.floor(rand() * 4);
      const bookHeight = Math.round((shelfHeight - 4) * (0.62 + rand() * 0.38));
      if (x + bookWidth >= width - 2) break;
      const color = spines[Math.floor(rand() * spines.length)] ?? '#0ea5e9';
      const lean = rand() > 0.96;
      for (let row = 0; row < bookHeight; row++) {
        const shift = lean ? Math.round((row / bookHeight) * 2) : 0;
        c.rect(
          x + shift,
          floor - 1 - row,
          x + shift + bookWidth - 1,
          floor - 1 - row,
          mix(color, '#000000', 0.12 * (x % 3)),
        );
      }
      c.rect(
        x,
        floor - 1 - bookHeight + 2,
        x + bookWidth - 1,
        floor - 1 - bookHeight + 2,
        mix(color, '#ffffff', 0.5),
      );
      c.rect(x, floor - 4, x + bookWidth - 1, floor - 4, mix(color, '#000000', 0.4));
      if (bookHeight > 9) {
        const mark = floor - 1 - Math.round(bookHeight * 0.55);
        c.rect(x + 1, mark, x + bookWidth - 2, mark, mix(color, '#ffffff', 0.7));
      }
      x += bookWidth;
    }
    if (shelfIndex === 1 && width > 40) {
      const px = Math.round(width * 0.85);
      c.rect(px, floor - 5, px + 5, floor - 1, '#9a4a2c');
      for (let leaf = 0; leaf < 7; leaf++)
        c.line(px + 2.5, floor - 5, px + leaf - 1, floor - 11 - (leaf % 3) * 2, '#3fae5a');
    }
  }
  const sit = shelfHeight - 3;
  const cx = catX + 6;
  const fur = '#1c1c24';
  c.blob(cx, sit - 5, 6, 5, () => fur);
  c.blob(cx + 5, sit - 11, 3.4, 3.4, () => fur);
  c.rect(cx + 2, sit - 16, cx + 3, sit - 14, fur);
  c.rect(cx + 7, sit - 16, cx + 8, sit - 14, fur);
  c.set(cx + 4, sit - 11, '#fbbf24');
  c.set(cx + 7, sit - 11, '#fbbf24');
  c.line(cx - 6, sit - 2, cx - 11, sit - 6, fur);
  c.line(cx - 11, sit - 6, cx - 11, sit - 10, fur);
  c.rect(0, 0, 1, height - 1, wood);
  c.rect(width - 2, 0, width - 1, height - 1, wood);
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
