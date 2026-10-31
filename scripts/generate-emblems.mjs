/* global document, Image */
// Regenerates src/logo/ascii-emblem*.txt from the club logo, drawn the way line-ASCII artists do:
// every stroke becomes the plain character that follows its direction, the face is shrunk a little so
// the smile does not merge into the inner ring, and the eyes of the smaller emblems are drawn by hand.
// Needs Playwright with a Chromium, which is not a dependency of this package:
//   PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/generate-emblems.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const CELL_WIDTH = 16;
const CELL_HEIGHT = 34;
const STROKE = 4;
const MIN_INK = 14;
const RASTER = 1664;
const CENTER = RASTER / 2;
const LOGO_WIDTH = 831.94;
const RING_RADII = { outer: 406.97 * 2, inner: 328.05 * 2 };
const BAND_RADIUS = ((406.97 + 328.05) / 2) * 2;
const PUPIL_RADIUS = 26;
const FACE_STROKE_WIDTH = 24;
// The face is drawn smaller than in the logo, so the smile does not merge into the inner ring.
const FACE_SCALE = 0.9;
// Row in the 1664-pixel raster between the eyes and the smile.
const EYE_SMILE_GAP = 840;
// Pupil centres in the 832-pixel logo, and the distance between the two eyes.
const PUPILS = [
  [120, 325],
  [452, 325],
];
const EYE_DISTANCE = 332;
const MIRRORED = { '/': '\\', '\\': '/', '(': ')', ')': '(', '`': "'", "'": '`' };
const UPRIGHT = '|()/\\';

// Each eye is a lid over a pupil looking sideways: its lines, then the pupil's row and column.
const EYES = {
  large: {
    lines: ["  .--''''''''--.", ' (@@@@@----------. `\\', "  '@@@@'       `'----'"],
    row: 1,
    col: 3,
  },
  medium: { lines: ["  .-'''''-.", ' (@@@----. `\\', "  '@@'   `'--'"], row: 1, col: 2 },
  small: { lines: [" .-''''-.", '(@@@---._`\\'], row: 1, col: 2 },
  tiny: { lines: [" .-'''.", '(@@---`\\'], row: 1, col: 2 },
};

const TIERS = [
  {
    file: 'src/logo/ascii-emblem-large.txt',
    cols: 56,
    rows: 26,
    rings: ['outer', 'inner'],
    eyes: 'large',
    band: {
      top: 'Computer Association of NBT',
      bottom: 'To be at the intersection of technology and liberal arts.',
    },
  },
  {
    file: 'src/logo/ascii-emblem-medium.txt',
    cols: 40,
    rows: 19,
    rings: ['outer', 'inner'],
    eyes: 'medium',
  },
  { file: 'src/logo/ascii-emblem-small.txt', cols: 26, rows: 12, rings: ['outer'], eyes: 'small' },
  { file: 'src/logo/ascii-emblem-tiny.txt', cols: 20, rows: 9, rings: ['outer'], eyes: 'tiny' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
const svg = readFileSync('scripts/emblem-face.svg', 'utf8');
const mask = await page.evaluate(
  async ({ svg, size }) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    let bits = '';
    for (let index = 0; index < size * size; index++)
      bits += pixels[index * 4 + 3] > 127 ? '1' : '0';
    return bits;
  },
  { svg, size: RASTER },
);
await browser.close();

const face = Uint8Array.from(mask, (bit) => (bit === '1' ? 1 : 0));

/** Distance from every pixel to the nearest pixel that is set in `sources`. */
function distanceTo(sources, size) {
  const INF = 1e20;
  const grid = Float64Array.from(sources, (value) => (value ? 0 : INF));
  const f = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  const transform = (get, set) => {
    for (let q = 0; q < size; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < size; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < size; q++) {
      while (z[k + 1] < q) k++;
      set(q, (q - v[k]) ** 2 + f[v[k]]);
    }
  };
  for (let x = 0; x < size; x++) {
    transform(
      (y) => grid[y * size + x],
      (y, value) => {
        grid[y * size + x] = value;
      },
    );
  }
  for (let y = 0; y < size; y++) {
    transform(
      (x) => grid[y * size + x],
      (x, value) => {
        grid[y * size + x] = value;
      },
    );
  }
  return Float32Array.from(grid, Math.sqrt);
}

const inverse = (bits) => Uint8Array.from(bits, (bit) => 1 - bit);
const within = (bits, radius) => {
  const dist = distanceTo(bits, RASTER);
  return Uint8Array.from(dist, (value) => (value <= radius ? 1 : 0));
};
const insideDepth = (bits) => distanceTo(inverse(bits), RASTER);

// The pupils are the blobs wider than a stroke; everything else in the face is a stroke to thin.
const eroded = Uint8Array.from(insideDepth(face), (depth) => (depth > PUPIL_RADIUS ? 1 : 0));
const pupils = Uint8Array.from(within(eroded, PUPIL_RADIUS), (bit, index) => bit & face[index]);
const nearPupils = within(pupils, 3);
const strokes = Uint8Array.from(face, (bit, index) => bit & (1 - nearPupils[index]));
const strokeDepth = insideDepth(strokes);

function resample(source, size, outSize) {
  const scale = size / outSize;
  const horizontal = new Float32Array(outSize * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < outSize; x++) {
      const start = x * scale;
      const end = start + scale;
      let sum = 0;
      for (let px = Math.floor(start); px < Math.min(size, Math.ceil(end)); px++) {
        sum += source[y * size + px] * (Math.min(px + 1, end) - Math.max(px, start));
      }
      horizontal[y * outSize + x] = sum / scale;
    }
  }
  const out = new Float32Array(outSize * outSize);
  for (let x = 0; x < outSize; x++) {
    for (let y = 0; y < outSize; y++) {
      const start = y * scale;
      const end = start + scale;
      let sum = 0;
      for (let py = Math.floor(start); py < Math.min(size, Math.ceil(end)); py++) {
        sum += horizontal[py * outSize + x] * (Math.min(py + 1, end) - Math.max(py, start));
      }
      out[y * outSize + x] = sum / scale;
    }
  }
  return out;
}

/** The raster scaled by FACE_SCALE around its centre. */
function shrink(source) {
  const out = new Float32Array(RASTER * RASTER);
  const at = (x, y) =>
    x < 0 || y < 0 || x >= RASTER - 1 || y >= RASTER - 1 ? 0 : source[y * RASTER + x];
  for (let y = 0; y < RASTER; y++) {
    for (let x = 0; x < RASTER; x++) {
      const sx = CENTER + (x - CENTER) / FACE_SCALE;
      const sy = CENTER + (y - CENTER) / FACE_SCALE;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      out[y * RASTER + x] =
        at(x0, y0) * (1 - fx) * (1 - fy) +
        at(x0 + 1, y0) * fx * (1 - fy) +
        at(x0, y0 + 1) * (1 - fx) * fy +
        at(x0 + 1, y0 + 1) * fx * fy;
    }
  }
  return out;
}

/** The rings with the smile, and the left eye, as rasters as wide as the emblem. */
function lineArt({ cols, rows, rings }) {
  const width = cols * CELL_WIDTH;
  const height = rows * CELL_HEIGHT;
  const stroke = STROKE * (RASTER / width);
  const ringArt = new Float32Array(RASTER * RASTER);
  const faceArt = new Float32Array(RASTER * RASTER);
  for (let y = 0; y < RASTER; y++) {
    for (let x = 0; x < RASTER; x++) {
      const index = y * RASTER + x;
      const radius = Math.hypot(x - CENTER, y - CENTER);
      let value = 0;
      for (const name of rings) {
        value = Math.max(
          value,
          Math.min(1, Math.max(0, stroke / 2 + 0.5 - Math.abs(radius - RING_RADII[name]))),
        );
      }
      ringArt[index] = value;
      faceArt[index] =
        strokeDepth[index] > (FACE_STROKE_WIDTH - stroke) / 2 || pupils[index] ? 1 : 0;
    }
  }
  const scaledFace = shrink(faceArt);
  const gap = Math.floor(CENTER + (EYE_SMILE_GAP - CENTER) * FACE_SCALE) * RASTER;
  const place = (square) => {
    const scaled = resample(square, RASTER, width);
    const out = new Float32Array(width * height);
    const offset = Math.floor((height - width) / 2);
    for (let y = 0; y < height; y++) {
      const sourceY = y - offset;
      if (sourceY < 0 || sourceY >= width) continue;
      out.set(scaled.subarray(sourceY * width, (sourceY + 1) * width), y * width);
    }
    return out;
  };
  return {
    width,
    lines: place(
      ringArt.map((value, index) => Math.max(value, index >= gap ? scaledFace[index] : 0)),
    ),
    leftEye: place(
      scaledFace.map((value, index) => (index < gap && index % RASTER < CENTER ? value : 0)),
    ),
  };
}

/** The plain character that follows the strokes in one cell, from their direction and position. */
function glyphFor(points, cover) {
  if (cover > 0.5) return '@';
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - meanX) ** 2;
    syy += (y - meanY) ** 2;
    sxy += (x - meanX) * (y - meanY);
  }
  const rising = ((((-0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI) % 180) + 180) % 180;
  const angle = Math.min(rising, 180 - rising);
  const height = meanY / CELL_HEIGHT;
  if (angle < 52) {
    if (height < 0.3) return angle < 30 || rising >= 90 ? "'" : '`';
    if (height < 0.62) return '-';
    return angle < 14 ? '_' : '.';
  }
  if (angle < 68) return rising < 90 ? '/' : '\\';
  if (angle < 82) return meanX < CELL_WIDTH / 2 ? '(' : ')';
  return '|';
}

/** A character in each cell that holds strokes, and only the strongest of a row's upright neighbours. */
function strokeCells(raster, width, cols, rows) {
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const points = [];
      for (let y = 0; y < CELL_HEIGHT; y++) {
        for (let x = 0; x < CELL_WIDTH; x++) {
          if (raster[(row * CELL_HEIGHT + y) * width + col * CELL_WIDTH + x] > 0.4) {
            points.push([x, y]);
          }
        }
      }
      if (points.length < MIN_INK) return { char: ' ', ink: 0 };
      return {
        char: glyphFor(points, points.length / (CELL_WIDTH * CELL_HEIGHT)),
        ink: points.length,
      };
    }),
  );
  for (const row of grid) {
    for (let col = 0; col < cols; col++) {
      if (!UPRIGHT.includes(row[col].char)) continue;
      let end = col;
      while (end + 1 < cols && UPRIGHT.includes(row[end + 1].char)) end++;
      let best = col;
      for (let index = col; index <= end; index++) {
        if (row[index].ink > row[best].ink) best = index;
      }
      for (let index = col; index <= end; index++) {
        if (index !== best) row[index] = { char: ' ', ink: 0 };
      }
      col = end;
    }
  }
  return grid.map((row) => row.map((cell) => cell.char));
}

// A word is a straight run of upright letters, so it stays readable; the arc is approximated by runs that step from row to row.
const WORD_PITCH = 20;
// A letter may replace a ring character, but only if the band has no free cell nearby.
const OVERWRITE = 25;
const RUNS = [
  { step: [1, 0], penalty: 0 },
  { step: [1, 1], penalty: 40 },
  { step: [1, -1], penalty: 40 },
  { step: [0, 1], penalty: 80 },
];

function bandPlacements(tier, grid) {
  const { cols, rows } = tier;
  const radius = (BAND_RADIUS * cols * CELL_WIDTH) / RASTER;
  const cx = (cols * CELL_WIDTH) / 2;
  const cy = (rows * CELL_HEIGHT) / 2;
  const used = new Set();
  const key = (col, row) => `${col},${row}`;
  const crowded = (col, row) =>
    used.has(key(col, row)) || used.has(key(col - 1, row)) || used.has(key(col + 1, row));
  const placements = [];
  for (const facing of ['top', 'bottom']) {
    const words = tier.band[facing].split(' ');
    const units = words.reduce((total, word) => total + word.length, 0) + words.length - 1;
    const direction = facing === 'top' ? 1 : -1;
    const centre = facing === 'top' ? -Math.PI / 2 : Math.PI / 2;
    let cursor = -(units * WORD_PITCH) / (2 * radius);
    for (const word of words) {
      const angle = centre + direction * (cursor + (word.length * WORD_PITCH) / (2 * radius));
      cursor += ((word.length + 1) * WORD_PITCH) / radius;
      const middleCol = (cx + radius * Math.cos(angle)) / CELL_WIDTH - 0.5;
      const middleRow = (cy + radius * Math.sin(angle)) / CELL_HEIGHT - 0.5;
      let best;
      let bestCost = Infinity;
      for (const { step, penalty } of RUNS) {
        for (let shiftCol = -2; shiftCol <= 2; shiftCol++) {
          for (let shiftRow = -2; shiftRow <= 2; shiftRow++) {
            const cells = [...word].map((_, index) => {
              const offset = index - (word.length - 1) / 2;
              return [
                Math.round(middleCol + offset * step[0]) + shiftCol,
                Math.round(middleRow + offset * step[1]) + shiftRow,
              ];
            });
            const tangent = [-Math.sin(angle) * direction, Math.cos(angle) * direction];
            const run = [step[0] * CELL_WIDTH, step[1] * CELL_HEIGHT];
            const alignment = (tangent[0] * run[0] + tangent[1] * run[1]) / Math.hypot(...run);
            let cost = penalty + 80 * (1 - alignment);
            for (const [col, row] of cells) {
              const drift =
                Math.hypot((col + 0.5) * CELL_WIDTH - cx, (row + 0.5) * CELL_HEIGHT - cy) - radius;
              cost += Math.abs(drift);
              if (col < 0 || col >= cols || row < 0 || row >= rows || crowded(col, row)) {
                cost += 1e6;
              } else if (grid[row][col] !== ' ') {
                cost += OVERWRITE;
              }
            }
            if (cost < bestCost) {
              bestCost = cost;
              best = cells;
            }
          }
        }
      }
      if (bestCost >= 1e6) console.warn(`no room for "${word}"`);
      best.forEach(([col, row], index) => {
        used.add(key(col, row));
        placements.push([col, row, word[index]]);
      });
    }
  }
  return placements;
}

function design(tier) {
  const { cols, rows } = tier;
  const { lines, leftEye, width } = lineArt(tier);
  const scale = width / LOGO_WIDTH;
  const grid = strokeCells(lines, width, cols, rows);
  for (const row of grid) {
    for (let col = 0; col < Math.floor(cols / 2); col++) {
      row[cols - 1 - col] = MIRRORED[row[col]] ?? row[col];
    }
  }
  if (tier.eyes) {
    const { lines: eye, row: pupilRow, col: pupilCol } = EYES[tier.eyes];
    for (const [px, py] of PUPILS) {
      const col =
        (((px - LOGO_WIDTH / 2) * FACE_SCALE + LOGO_WIDTH / 2) * scale) / CELL_WIDTH - 0.5;
      const row =
        ((rows * CELL_HEIGHT) / 2 + (py - LOGO_WIDTH / 2) * FACE_SCALE * scale) / CELL_HEIGHT - 0.5;
      eye.forEach((line, y) => {
        [...line].forEach((char, x) => {
          const target = grid[Math.round(row - pupilRow) + y];
          if (char !== ' ' && target) target[Math.round(col - pupilCol) + x] = char;
        });
      });
    }
  } else {
    const shift = Math.round((EYE_DISTANCE * FACE_SCALE * scale) / CELL_WIDTH);
    strokeCells(leftEye, width, cols, rows).forEach((row, y) => {
      row.forEach((char, x) => {
        if (char === ' ') return;
        grid[y][x] = char;
        if (x + shift < cols) grid[y][x + shift] = char;
      });
    });
  }
  if (tier.band) {
    for (const [col, row, char] of bandPlacements(tier, grid)) grid[row][col] = char;
  }
  const out = grid.map((row) => row.join('').replace(/\s+$/, ''));
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join('\n') + '\n';
}

for (const tier of TIERS) {
  writeFileSync(tier.file, design(tier));
  console.log(tier.file);
}
