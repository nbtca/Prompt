import { emblemLines } from '../core/logo.js';
import { padEndV, visualWidth } from '../core/text.js';
import { renderBitmap, type Bitmap } from '../core/pixel-art.js';
import { mountainScene, scaleBitmap, shelfScene, skyScene } from '../art/scene.js';
import { space } from '../core/theme.js';

/** What a page draws in the space its content leaves empty. */
export type AmbientSpec =
  | { kind: 'sky' }
  | { kind: 'shelf' }
  | { kind: 'mountain'; progress: number }
  | { kind: 'emblem' }
  | { kind: 'icon'; icon: Bitmap };

const GAP = 4;
const MIN_WIDTH = 30;
const MIN_ROWS = 7;
const MAX_SCENE_WIDTH = 104;
const SCENE_GAMMA = 1.8;

function hourOf(now: Date): number {
  return now.getHours() + now.getMinutes() / 60;
}

function picture(spec: AmbientSpec, width: number, rows: number, now: Date): string[] | undefined {
  switch (spec.kind) {
    case 'sky':
    case 'mountain': {
      const cols = Math.min(width, MAX_SCENE_WIDTH);
      const height = Math.min(rows, Math.round(cols * 0.55));
      if (cols < MIN_WIDTH || height < MIN_ROWS) return undefined;
      return renderBitmap(
        spec.kind === 'sky'
          ? skyScene(cols, height * 2, hourOf(now))
          : mountainScene(cols, height * 2, spec.progress, hourOf(now)),
        undefined,
        SCENE_GAMMA,
      );
    }
    case 'shelf': {
      const cols = Math.min(width, 64);
      const height = Math.min(rows, Math.round(cols * 0.5));
      return cols < MIN_WIDTH || height < MIN_ROWS
        ? undefined
        : renderBitmap(shelfScene(cols, height * 2), undefined, SCENE_GAMMA);
    }
    case 'emblem':
      return emblemLines(width, rows);
    case 'icon': {
      const factor = Math.min(
        Math.floor(width / (spec.icon.rows[0]?.length ?? 1)),
        Math.floor((rows * 2) / spec.icon.rows.length),
        3,
      );
      return factor >= 2 ? renderBitmap(scaleBitmap(spec.icon, factor)) : undefined;
    }
  }
}

/** Puts a picture to the right of the page, as large as the leftover space allows. */
export function withAmbient(
  body: readonly string[],
  spec: AmbientSpec | undefined,
  cols: number,
  bodyRows: number,
  now = new Date(),
): string[] {
  if (!spec || !Number.isFinite(cols) || !Number.isFinite(bodyRows)) return [...body];
  const contentWidth = Math.max(0, ...body.map(visualWidth));
  const width = cols - contentWidth - GAP - visualWidth(space.indent);
  const art = picture(spec, width, Math.max(0, Math.floor(bodyRows) - 1), now);
  if (!art) return [...body];

  const rows = Math.max(body.length, art.length);
  return Array.from({ length: rows }, (_, index) => {
    const left = body[index] ?? '';
    const right = art[index];
    return right === undefined ? left : `${padEndV(left, contentWidth + GAP)}${right}`;
  });
}
