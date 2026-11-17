import type { Bitmap } from '../core/pixel-art.js';
import type { EventKind } from '../features/event-art.js';
import { fbm3 } from './noise.js';
import { Canvas, mix, random } from './scene.js';

export const STAR_COLORS: Readonly<Record<EventKind, string>> = {
  repair: '#fbbf24',
  workshop: '#5eead4',
  conference: '#c4b5fd',
  meeting: '#93c5fd',
  birthday: '#f9a8d4',
  other: '#f1f5f9',
};

export interface EventStar {
  at: number;
  kind: EventKind;
  /** Any stable number per event, so each star keeps its height between renders. */
  seed: number;
}

const YEAR_MS = 365 * 86_400_000;
const CONSTELLATION_GAP_MS = 45 * 86_400_000;
const CONSTELLATION_SIZE = 5;

/** The past year as a night sky: one star per event, left to right in time, with events of a kind joined into constellations. */
export function starMapScene(
  width: number,
  height: number,
  stars: readonly EventStar[],
  now: Date,
): Bitmap {
  const c = new Canvas(width, height);
  const rand = random(7);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = mix('#050b1e', '#13234a', y / height);
      const band = Math.exp(-(((y / height - 0.75 + (x / width) * 0.5) / 0.18) ** 2));
      const dust = fbm3([x / 18, y / 9, 0.5], 3, 3);
      c.set(x, y, mix(base, '#3b4f8a', band * dust * 0.55));
    }
  }
  for (let index = 0; index < width * height * 0.004; index++) {
    c.set(rand() * width, rand() * height, rand() > 0.5 ? '#4a5a85' : '#6b7aa6');
  }

  const start = now.getTime() - YEAR_MS;
  const unit = (seed: number) => (((seed % 997) + 997) % 997) / 997;
  const placed: { star: EventStar; x: number; y: number }[] = [];
  for (const kind of Object.keys(STAR_COLORS) as EventKind[]) {
    const chain = stars
      .filter((star) => star.kind === kind && star.at >= start && star.at <= now.getTime())
      .sort((a, b) => a.at - b.at);
    let group: { star: EventStar; x: number; y: number }[] = [];
    let centre = 0.5;
    for (const star of chain) {
      const previous = group.at(-1);
      if (
        !previous ||
        group.length >= CONSTELLATION_SIZE ||
        star.at - previous.star.at > CONSTELLATION_GAP_MS
      ) {
        group = [];
        centre = 0.2 + 0.6 * unit(star.seed);
      }
      const y = Math.min(0.95, Math.max(0.05, centre + (unit(star.seed * 31) - 0.5) * 0.35));
      const point = {
        star,
        x: 2 + ((star.at - start) / YEAR_MS) * (width - 5),
        y: y * (height - 3),
      };
      if (previous && group.length > 0) {
        const steps = Math.max(
          1,
          Math.round(Math.hypot(point.x - previous.x, point.y - previous.y)),
        );
        for (let step = 0; step <= steps; step++) {
          const x = previous.x + ((point.x - previous.x) * step) / steps;
          const ly = previous.y + ((point.y - previous.y) * step) / steps;
          c.set(x, ly, mix(c.get(x, ly) ?? '#050b1e', STAR_COLORS[kind], 0.22));
        }
      }
      group.push(point);
      placed.push(point);
    }
  }

  for (const { star, x, y } of placed) {
    const color = STAR_COLORS[star.kind];
    const glow = star.kind === 'conference' ? 2 : 1;
    c.blob(x, y, glow + 1.5, glow + 1.5, (px, py, edge) =>
      mix(c.get(px, py) ?? '#050b1e', color, 0.6 * (1 - edge) ** 2),
    );
    c.set(x, y, '#ffffff');
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      c.set(x + dx, y + dy, color);
  }

  for (let month = 0; month < 12; month++) {
    const first = new Date(now.getFullYear(), now.getMonth() - month, 1).getTime();
    c.set(2 + ((first - start) / YEAR_MS) * (width - 5), height - 1, '#2a3a66');
  }
  return c.toBitmap();
}
