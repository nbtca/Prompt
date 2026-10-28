type Vec = readonly [number, number, number];

function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth value noise in 0..1. */
export function noise3([x, y, z]: Vec, seed = 0): number {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [fx, fy, fz] = [smooth(x - ix), smooth(y - iy), smooth(z - iz)];
  const at = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz, seed);
  return mix(
    mix(mix(at(0, 0, 0), at(1, 0, 0), fx), mix(at(0, 1, 0), at(1, 1, 0), fx), fy),
    mix(mix(at(0, 0, 1), at(1, 0, 1), fx), mix(at(0, 1, 1), at(1, 1, 1), fx), fy),
    fz,
  );
}

/** Fractal Brownian motion: octaves of value noise, in 0..1. */
export function fbm3(p: Vec, octaves = 3, seed = 0): number {
  let sum = 0;
  let amplitude = 0.5;
  let scale = 1;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * noise3([p[0] * scale, p[1] * scale, p[2] * scale], seed + octave * 17);
    amplitude /= 2;
    scale *= 2;
  }
  return sum / (1 - 0.5 ** octaves);
}

/** Worley noise: distance to the nearest of one random feature point per unit cell, which makes crater bowls. */
export function worley3([x, y, z]: Vec, seed = 0): number {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  let nearest = Number.POSITIVE_INFINITY;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const [cx, cy, cz] = [ix + dx, iy + dy, iz + dz];
        const px = cx + hash(cx, cy, cz, seed + 1);
        const py = cy + hash(cx, cy, cz, seed + 2);
        const pz = cz + hash(cx, cy, cz, seed + 3);
        nearest = Math.min(nearest, (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2);
      }
    }
  }
  return Math.sqrt(nearest);
}
