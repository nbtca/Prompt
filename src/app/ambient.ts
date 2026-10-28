import { emblemLines } from '../core/logo.js';
import { padEndV, visualWidth } from '../core/text.js';
import chalk from 'chalk';
import { pictureMode, renderBitmap, type Bitmap } from '../core/pixel-art.js';
import { mountainScene, scaleBitmap, shelfScene, skyScene } from '../art/scene.js';
import { space } from '../core/theme.js';

/** What a page draws in the space its content leaves empty. */
export type AmbientSpec =
  | { kind: 'sky' }
  | { kind: 'shelf' }
  | { kind: 'mountain'; progress: number; weeks: number }
  | { kind: 'emblem' }
  | { kind: 'icon'; icon: Bitmap };

const GAP = 4;
const MIN_COLS = 30;
const MIN_ROWS = 7;
const MIN_PANORAMA_ROWS = 8;
const MAX_COLS = 130;
const SCENE_GAMMA = 0.8;
const FINE = { x: 2, y: 4 } as const;

const cache = new Map<string, string[]>();

function remember(key: string, build: () => string[]): string[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const lines = build();
  if (cache.size >= 8) cache.delete(cache.keys().next().value ?? '');
  cache.set(key, lines);
  return lines;
}

/** A landscape that fills the given box of cells with Braille-fine pixels, or undefined when the box is too small. */
function scene(spec: AmbientSpec, cols: number, rows: number, now: Date): string[] | undefined {
  if (spec.kind !== 'sky' && spec.kind !== 'mountain' && spec.kind !== 'shelf') return undefined;
  const width = Math.min(cols, MAX_COLS);
  if (width < MIN_COLS || rows < MIN_ROWS) return undefined;
  const minute = Math.floor(now.getTime() / 300_000);
  const key = [
    spec.kind,
    width,
    rows,
    minute,
    spec.kind === 'mountain' ? spec.progress.toFixed(3) : '',
    pictureMode(),
    chalk.level,
  ].join('|');
  return remember(key, () => {
    const pixels = { width: width * FINE.x, height: rows * FINE.y };
    const bitmap =
      spec.kind === 'sky'
        ? skyScene(pixels.width, pixels.height, now)
        : spec.kind === 'mountain'
          ? mountainScene(pixels.width, pixels.height, spec.progress, spec.weeks, now)
          : shelfScene(pixels.width, pixels.height);
    return renderBitmap(bitmap, undefined, SCENE_GAMMA);
  });
}

function compact(spec: AmbientSpec, cols: number, rows: number): string[] | undefined {
  if (spec.kind === 'emblem') return emblemLines(cols, rows);
  if (spec.kind !== 'icon') return undefined;
  const factor = Math.min(
    Math.floor(cols / (spec.icon.rows[0]?.length ?? 1)),
    Math.floor((rows * 2) / spec.icon.rows.length),
    3,
  );
  return factor >= 2 ? renderBitmap(scaleBitmap(spec.icon, factor)) : undefined;
}

/**
 * Fills the empty space of a page: a full-width panorama underneath when enough rows are free,
 * otherwise a picture to the right of the content, as large as the leftover space allows.
 */
export function withAmbient(
  body: readonly string[],
  spec: AmbientSpec | undefined,
  cols: number,
  bodyRows: number,
  now = new Date(),
): string[] {
  if (!spec || !Number.isFinite(cols) || !Number.isFinite(bodyRows)) return [...body];
  const indent = visualWidth(space.indent);
  const rows = Math.floor(bodyRows);

  const below = rows - body.length - 1;
  const panorama = scene(spec, cols - indent * 2, below, now);
  if (panorama && below >= MIN_PANORAMA_ROWS) {
    return [...body, '', ...panorama.map((line) => space.indent + line)];
  }

  const contentWidth = Math.max(0, ...body.map(visualWidth));
  const width = cols - contentWidth - GAP - indent;
  const side = Math.min(rows - 1, Math.round(Math.min(width, MAX_COLS) * 0.55));
  const art = scene(spec, width, side, now) ?? compact(spec, width, rows - 1);
  if (!art) return [...body];

  return Array.from({ length: Math.max(body.length, art.length) }, (_, index) => {
    const left = body[index] ?? '';
    const right = art[index];
    return right === undefined ? left : `${padEndV(left, contentWidth + GAP)}${right}`;
  });
}
