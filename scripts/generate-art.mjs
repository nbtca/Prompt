// Regenerates src/logo/ascii-emblem-*.txt and src/art/bitmaps.ts. Run: node scripts/generate-art.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const TONE_RAMP = ' .:-=+*#%@';

function brailleDots(path) {
  const lines = readFileSync(path, 'utf8').replace(/\s+$/, '').split('\n');
  const width = Math.max(...lines.map((line) => [...line].length)) * 2;
  const height = lines.length * 4;
  const dots = Array.from({ length: height }, () => new Float32Array(width));
  const offsets = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
    [0, 3],
    [1, 3],
  ];
  lines.forEach((line, row) => {
    [...line].forEach((char, col) => {
      const mask = char.codePointAt(0) - 0x2800;
      if (mask <= 0 || mask >= 256) return;
      offsets.forEach(([dx, dy], bit) => {
        if ((mask >> bit) & 1) dots[row * 4 + dy][col * 2 + dx] = 1;
      });
    });
  });
  return { dots, width, height };
}

function boxBlur(grid, width, height, radius) {
  return grid.map((_, y) => {
    const out = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < height && xx >= 0 && xx < width) {
            sum += grid[yy][xx];
            count++;
          }
        }
      }
      out[x] = sum / count;
    }
    return out;
  });
}

function shadedEmblem(path, outWidth) {
  const { dots, width, height } = brailleDots(path);
  const blurred = boxBlur(boxBlur(dots, width, height, 1), width, height, 1);
  const scaleX = width / outWidth;
  const scaleY = height / outWidth;
  const pixels = Array.from({ length: outWidth }, (_, y) =>
    Array.from({ length: outWidth }, (_, x) => {
      let sum = 0;
      let count = 0;
      for (let yy = Math.floor(y * scaleY); yy < Math.floor((y + 1) * scaleY); yy++) {
        for (let xx = Math.floor(x * scaleX); xx < Math.floor((x + 1) * scaleX); xx++) {
          sum += blurred[yy][xx];
          count++;
        }
      }
      return sum / count;
    }),
  );
  const peak = Math.max(...pixels.flat());
  const rows = [];
  for (let y = 0; y < outWidth; y += 2) {
    let line = '';
    for (let x = 0; x < outWidth; x++) {
      const value = (pixels[y][x] + (pixels[y + 1]?.[x] ?? 0)) / 2 / peak;
      const level = Math.round(Math.pow(value, 0.5) * (TONE_RAMP.length - 1));
      line += TONE_RAMP[Math.min(TONE_RAMP.length - 1, level)];
    }
    rows.push(line.replace(/\s+$/, ''));
  }
  return rows.join('\n') + '\n';
}

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: height }, () => Array(width).fill(null));
  }
  set(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.cells[y][x] = color;
  }
  get(x, y) {
    return this.cells[y]?.[x] ?? null;
  }
  rect(x0, y0, x1, y1, color) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        this.set(x, y, typeof color === 'function' ? color(x, y) : color);
  }
  circle(cx, cy, r, color, hole = 0) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1);
        if (d <= r && d >= hole)
          this.set(x, y, typeof color === 'function' ? color(x, y, d) : color);
      }
    }
  }
  line(x0, y0, x1, y1, color) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++)
      this.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, color);
  }
  toBitmap() {
    const symbols = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const palette = {};
    const lookup = new Map();
    const rows = this.cells.map((row) =>
      row
        .map((color) => {
          if (color === null) return ' ';
          if (!lookup.has(color)) {
            if (lookup.size >= symbols.length) throw new Error('palette too large');
            const symbol = symbols[lookup.size];
            lookup.set(color, symbol);
            palette[symbol] = color;
          }
          return lookup.get(color);
        })
        .join(''),
    );
    return { palette, rows };
  }
}

function seeded(seed) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

function scene(width, height) {
  const c = new Canvas(width, height);
  const k = width / 60;
  const horizon = Math.round(height * 0.55);
  const sky = ['#081a33', '#0b2a52', '#124689', '#1d5fa8', '#5b4b9a', '#a0508c', '#e0705f'];
  const bandRows = Math.max(1, Math.round(horizon / sky.length));
  for (let y = 0; y < horizon; y++)
    c.rect(0, y, width - 1, y, sky[Math.min(sky.length - 1, Math.floor(y / bandRows))]);
  const random = seeded(7);
  for (let i = 0; i < Math.round(16 * k); i++)
    c.set(Math.floor(random() * width), Math.floor(random() * horizon * 0.4), '#f8fafc');
  const cx = width / 2;
  c.circle(cx, horizon, 9 * k, (x, y) => (y < horizon ? '#e8885a' : null));
  c.circle(cx, horizon, 6.5 * k, (x, y) => (y < horizon ? '#ffd27a' : null));
  const cloud = [
    [6, 0.38, 18, '#7c6bc4'],
    [38, 0.3, 16, '#7c6bc4'],
    [12, 0.62, 22, '#d98aa8'],
    [34, 0.7, 20, '#d98aa8'],
  ];
  cloud.forEach(([x, row, w, color]) =>
    c.rect(
      Math.round(x * k),
      Math.round(horizon * row),
      Math.round((x + w) * k) - 1,
      Math.round(horizon * row),
      color,
    ),
  );
  const sea = ['#3a3f7a', '#2b3768', '#1f2c55', '#16224a', '#0f1a3a'];
  const seaBand = Math.max(1, Math.round((height - horizon) / sea.length));
  for (let y = horizon; y < height; y++)
    c.rect(0, y, width - 1, y, sea[Math.min(sea.length - 1, Math.floor((y - horizon) / seaBand))]);
  for (let y = horizon + 1; y < height - 2; y++) {
    const half = Math.max(1, Math.round((10 - (y - horizon) * 0.8) * k));
    if ((y - horizon) % 2 === 1)
      c.rect(
        Math.round(cx - half),
        y,
        Math.round(cx + half),
        y,
        y < horizon + 5 ? '#f0b266' : '#b9803f',
      );
  }
  const hill = '#050d1c';
  const bump = (x0, x1, peak, mid, spread) => {
    for (let x = Math.round(x0 * k); x < Math.round(x1 * k); x++) {
      const h = Math.round(peak * Math.exp(-Math.pow((x - mid * k) / (spread * k), 2)) + 1);
      c.rect(x, horizon - h + 1, x, horizon, hill);
    }
  };
  bump(0, 22, Math.round(horizon * 0.3), 9, 7);
  bump(40, 60, Math.round(horizon * 0.22), 52, 6);
  const tx = Math.round(51 * k);
  c.rect(tx, horizon - 9, tx + 1, horizon - 5, hill);
  c.rect(tx - 1, horizon - 5, tx + 2, horizon - 5, hill);
  c.set(tx, horizon - 10, '#ffe08a');
  c.set(tx + 1, horizon - 10, '#ffe08a');
  c.rect(0, height - 2, width - 1, height - 1, hill);
  return c.toBitmap();
}

const ICON = {
  navy: '#102a52',
  blue: '#0ea5e9',
  cyan: '#06b6d4',
  pale: '#bae6fd',
  white: '#f1f5f9',
  amber: '#f59e0b',
  slate: '#94a3b8',
};

function calendarPage(c, x0, y0, x1, y1, mark) {
  c.rect(x0, y0 + 1, x1, y1, ICON.white);
  c.rect(x0, y0 + 1, x1, y0 + 2, ICON.blue);
  c.set(x0 + 2, y0, ICON.slate);
  c.set(x1 - 2, y0, ICON.slate);
  for (let y = y0 + 4; y <= y1 - 1; y += 2)
    for (let x = x0 + 2; x <= x1 - 1; x += 2) c.set(x, y, ICON.pale);
  if (mark) c.rect(...mark, ICON.amber);
}

function icons() {
  const make = (draw) => {
    const c = new Canvas(12, 10);
    draw(c);
    return c.toBitmap();
  };
  return {
    default: make((c) => calendarPage(c, 1, 0, 10, 9, [5, 6, 6, 7])),
    meeting: make((c) => {
      c.rect(0, 0, 7, 4, ICON.cyan);
      c.set(1, 5, ICON.cyan);
      c.set(2, 5, ICON.cyan);
      c.set(1, 6, ICON.cyan);
      [2, 4, 6].forEach((x) => c.set(x, 2, ICON.navy));
      c.rect(4, 5, 11, 9, ICON.pale);
      c.set(10, 7, null);
      [6, 8, 10].forEach((x) => c.set(x, 7, ICON.blue));
    }),
    workshop: make((c) => {
      c.rect(0, 0, 11, 9, ICON.navy);
      [
        [3, 2],
        [2, 3],
        [1, 4],
        [1, 5],
        [2, 6],
        [3, 7],
        [8, 2],
        [9, 3],
        [10, 4],
        [10, 5],
        [9, 6],
        [8, 7],
      ].forEach(([x, y]) => c.set(x, y, ICON.pale));
      [
        [7, 2],
        [7, 3],
        [6, 4],
        [6, 5],
        [5, 6],
        [5, 7],
      ].forEach(([x, y]) => c.set(x, y, ICON.cyan));
    }),
    repair: make((c) => {
      c.circle(5.5, 4.5, 3.6, (x, y, d) => (d < 2.4 ? ICON.slate : ICON.white), 1.4);
      [
        [5, 0],
        [6, 0],
        [5, 9],
        [6, 9],
        [0, 4],
        [0, 5],
        [11, 4],
        [11, 5],
        [2, 1],
        [9, 1],
        [2, 8],
        [9, 8],
      ].forEach(([x, y]) => c.set(x, y, ICON.slate));
      c.set(5, 4, ICON.amber);
      c.set(6, 5, ICON.amber);
    }),
    conference: make((c) => {
      c.rect(0, 0, 11, 6, ICON.slate);
      c.rect(1, 1, 10, 5, ICON.navy);
      c.rect(2, 4, 3, 5, ICON.cyan);
      c.rect(5, 2, 6, 5, ICON.pale);
      c.rect(8, 3, 9, 5, ICON.amber);
      c.rect(5, 7, 6, 8, ICON.slate);
      c.rect(3, 9, 8, 9, ICON.slate);
    }),
  };
}

function emptyArt() {
  const calendar = new Canvas(14, 12);
  calendarPage(calendar, 1, 0, 12, 11, null);
  calendar.rect(5, 6, 8, 7, '#e2e8f0');
  const search = new Canvas(14, 12);
  search.circle(
    5.5,
    5,
    4.6,
    (x, y, d) => (d < 3.2 ? (x + y < 9 ? '#e0f2fe' : '#7dd3fc') : ICON.cyan),
    0,
  );
  search.circle(5.5, 5, 4.6, ICON.cyan, 3.2);
  search.line(9, 8, 12, 11, ICON.amber);
  search.line(10, 8, 13, 11, ICON.amber);
  search.set(3, 3, ICON.white);
  search.set(4, 3, ICON.white);
  search.set(3, 4, ICON.white);
  return { calendar: calendar.toBitmap(), search: search.toBitmap() };
}

function emitBitmap(name, bitmap) {
  const palette = JSON.stringify(bitmap.palette)
    .replace(/"/g, "'")
    .replace(/,/g, ', ')
    .replace(/:/g, ': ');
  const rows = bitmap.rows.map((row) => `    '${row}',`).join('\n');
  return `export const ${name}: Bitmap = {\n  palette: ${palette},\n  rows: [\n${rows}\n  ],\n};\n`;
}

const bitmaps = [
  "import type { Bitmap } from '../core/pixel-art.js';",
  '',
  '// Generated by scripts/generate-art.mjs; edit the script, not this file.',
  '',
  emitBitmap('scene', scene(44, 18)),
];
const iconSet = icons();
for (const [name, bitmap] of Object.entries(iconSet))
  bitmaps.push(emitBitmap(`eventIcon${name[0].toUpperCase()}${name.slice(1)}`, bitmap));
const empty = emptyArt();
for (const [name, bitmap] of Object.entries(empty))
  bitmaps.push(emitBitmap(`empty${name[0].toUpperCase()}${name.slice(1)}`, bitmap));
writeFileSync('src/art/bitmaps.ts', bitmaps.join('\n'));

const large = 'src/logo/ca-dotmatrix-large.txt';
writeFileSync('src/logo/ascii-emblem-large.txt', shadedEmblem(large, 44));
writeFileSync('src/logo/ascii-emblem-medium.txt', shadedEmblem(large, 30));
console.log('art generated');
