/* global document, Image */
// Regenerates src/logo/ascii-emblem*.txt by fitting ASCII characters to the club logo.
// Needs Playwright with a Chromium, which is not a dependency of this package:
//   PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/generate-emblems.mjs
//
// The logo is thinned to line art, then every cell gets the glyph that makes the blurred
// rendering of the whole grid closest to the blurred line art, so strokes continue across cells.
import { readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const CELL_WIDTH = 16;
const CELL_HEIGHT = 34;
const FONT_SIZE = 26.7;
const BASELINE = 27;
const CHARS = ' .,:;\'`"^_~-=+*|/\\<>()@';
const SOLID = new Set(['@']);
const SOLID_DENSITY = 0.35;
const SIGMA = 2.5;
const SWEEPS = 4;
const STROKE = 4;
const FACE_WEIGHT = 3;
const RASTER = 1664;
const CENTER = RASTER / 2;
const RING_RADII = { outer: 406.97 * 2, inner: 328.05 * 2 };
const PUPIL_RADIUS = 26;
const FACE_STROKE_WIDTH = 24;
const FACE_REACH = 30;

const TIERS = [
  { file: 'src/logo/ascii-emblem-large.txt', cols: 56, rows: 26, rings: ['outer', 'inner'] },
  { file: 'src/logo/ascii-emblem-medium.txt', cols: 40, rows: 19, rings: ['outer', 'inner'] },
  { file: 'src/logo/ascii-emblem-small.txt', cols: 26, rows: 12, rings: ['outer'] },
  { file: 'src/logo/ascii-emblem-tiny.txt', cols: 20, rows: 9, rings: ['outer'] },
];

const browser = await chromium.launch();
const page = await browser.newPage();
const svg = readFileSync('scripts/emblem-face.svg', 'utf8');
const { mask, glyphs } = await page.evaluate(
  async ({ svg, size, chars, cell, fontSize, baseline }) => {
    await document.fonts.load('200px "JetBrainsMono NFM"');
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

    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = cell.width;
    glyphCanvas.height = cell.height;
    const glyphContext = glyphCanvas.getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const char of chars) {
      glyphContext.clearRect(0, 0, cell.width, cell.height);
      glyphContext.fillStyle = '#000';
      glyphContext.font = `${fontSize}px "JetBrainsMono NFM"`;
      glyphContext.textBaseline = 'alphabetic';
      glyphContext.fillText(char, 0, baseline);
      const data = glyphContext.getImageData(0, 0, cell.width, cell.height).data;
      out.push(
        Array.from({ length: cell.width * cell.height }, (_, index) => data[index * 4 + 3] / 255),
      );
    }
    return { mask: bits, glyphs: out };
  },
  {
    svg,
    size: RASTER,
    chars: [...CHARS],
    cell: { width: CELL_WIDTH, height: CELL_HEIGHT },
    fontSize: FONT_SIZE,
    baseline: BASELINE,
  },
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
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < size; q++) {
      f[q] = get(q);
      let s;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s > z[k] || k === 0) break;
        k--;
      }
      if (s <= z[k]) s = z[k] + 1e-9;
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
  f[0] = 0;
  for (let x = 0; x < size; x++) {
    f[0] = grid[x];
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

// Eyes' pupils are the blobs wider than a stroke; everything else in the face is a stroke to thin.
const eroded = Uint8Array.from(insideDepth(face), (depth) => (depth > PUPIL_RADIUS ? 1 : 0));
const pupils = Uint8Array.from(within(eroded, PUPIL_RADIUS), (bit, index) => bit & face[index]);
const nearPupils = within(pupils, 3);
const strokes = Uint8Array.from(face, (bit, index) => bit & (1 - nearPupils[index]));
const strokeDepth = insideDepth(strokes);
const faceReach = within(face, FACE_REACH);

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

/** Zero-padded Gaussian blur of a width x height image. */
function blur(image, width, height, sigma) {
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) =>
    Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)),
  );
  const total = kernel.reduce((a, b) => a + b, 0);
  const normalized = kernel.map((value) => value / total);
  const pass = (input, w, h, horizontal) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h)
            sum += input[yy * w + xx] * normalized[k + radius];
        }
        out[y * w + x] = sum;
      }
    }
    return out;
  };
  return pass(pass(image, width, height, true), width, height, false);
}

function lineArt({ cols, rows, rings }) {
  const width = cols * CELL_WIDTH;
  const height = rows * CELL_HEIGHT;
  const stroke = STROKE * (RASTER / width);
  const art = new Float32Array(RASTER * RASTER);
  const weight = new Float32Array(RASTER * RASTER);
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
      if (strokeDepth[index] > (FACE_STROKE_WIDTH - stroke) / 2) value = 1;
      if (pupils[index]) value = 1;
      art[index] = value;
      weight[index] = faceReach[index];
    }
  }
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
  return { target: place(art), faceMask: place(weight), width, height };
}

function fit(tier) {
  const { target, faceMask, width, height } = lineArt(tier);
  const { cols, rows } = tier;
  const margin = Math.ceil(3 * SIGMA);
  const paddedWidth = width + 2 * margin;
  const pad = (image) => {
    const out = new Float32Array(paddedWidth * (height + 2 * margin));
    for (let y = 0; y < height; y++)
      out.set(image.subarray(y * width, (y + 1) * width), (y + margin) * paddedWidth + margin);
    return out;
  };
  const blurred = pad(blur(target, width, height, SIGMA));
  const weights = pad(faceMask.map((value) => 1 + (FACE_WEIGHT - 1) * value));
  weights.fill(1, 0, margin * paddedWidth);
  const windowWidth = CELL_WIDTH + 2 * margin;
  const windowHeight = CELL_HEIGHT + 2 * margin;
  const windows = glyphs.map((glyph) => {
    const canvas = new Float32Array(windowWidth * windowHeight);
    for (let y = 0; y < CELL_HEIGHT; y++) {
      for (let x = 0; x < CELL_WIDTH; x++)
        canvas[(y + margin) * windowWidth + x + margin] = glyph[y * CELL_WIDTH + x];
    }
    return blur(canvas, windowWidth, windowHeight, SIGMA);
  });
  const squares = windows.map((window) => window.map((value) => value * value));
  const solid = [...CHARS].map((char) => SOLID.has(char));
  const density = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      let sum = 0;
      for (let y = 0; y < CELL_HEIGHT; y++) {
        for (let x = 0; x < CELL_WIDTH; x++)
          sum += target[(row * CELL_HEIGHT + y) * width + col * CELL_WIDTH + x];
      }
      return sum / (CELL_WIDTH * CELL_HEIGHT);
    }),
  );
  const composite = new Float32Array(blurred.length);
  const chosen = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const offsetOf = (row, col) => row * CELL_HEIGHT * paddedWidth + col * CELL_WIDTH;
  const sweep = (first) => {
    let changed = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const origin = offsetOf(row, col);
        const old = chosen[row][col];
        if (!first) {
          for (let y = 0; y < windowHeight; y++) {
            for (let x = 0; x < windowWidth; x++)
              composite[origin + y * paddedWidth + x] -= windows[old][y * windowWidth + x];
          }
        }
        const residual = new Float32Array(windowWidth * windowHeight);
        const local = new Float32Array(windowWidth * windowHeight);
        for (let y = 0; y < windowHeight; y++) {
          for (let x = 0; x < windowWidth; x++) {
            const source = origin + y * paddedWidth + x;
            residual[y * windowWidth + x] = blurred[source] - composite[source];
            local[y * windowWidth + x] = weights[source];
          }
        }
        let best = 0;
        let bestError = Infinity;
        windows.forEach((window, index) => {
          if (solid[index] && density[row][col] < SOLID_DENSITY) return;
          let error = 0;
          for (let i = 0; i < window.length; i++)
            error += local[i] * (squares[index][i] - 2 * window[i] * residual[i]);
          if (error < bestError) {
            bestError = error;
            best = index;
          }
        });
        if (!first && best !== old) changed++;
        chosen[row][col] = best;
        for (let y = 0; y < windowHeight; y++) {
          for (let x = 0; x < windowWidth; x++)
            composite[origin + y * paddedWidth + x] += windows[best][y * windowWidth + x];
        }
      }
    }
    return changed;
  };
  sweep(true);
  for (let pass = 1; pass < SWEEPS && sweep(false) > 0; pass++);
  const lines = chosen.map((row) =>
    row
      .map((index) => CHARS[index])
      .join('')
      .replace(/\s+$/, ''),
  );
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n') + '\n';
}

for (const tier of TIERS) {
  writeFileSync(tier.file, fit(tier));
  console.log(tier.file);
}
