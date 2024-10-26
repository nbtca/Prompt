// Enhanced animated text with multiple effects and options.

import lolcat from 'isomorphic-lolcat';
import chalk from 'chalk';

type AnimationEffect = 'rainbow' | 'wave' | 'pulse' | 'typewriter';

interface AnimationOptions {
  duration?: number;
  fps?: number;
  effect?: AnimationEffect;
}

interface LolcatColor {
  red: number;
  green: number;
  blue: number;
}

/**
 * Print a line of text with enhanced lolcat rainbow effect.
 * @param text - The text to animate.
 * @param options - Animation options: { duration: ms, fps: number, effect: string }
 */
export async function printLolcatAnimated(text: string, options: AnimationOptions = {}): Promise<void> {
  const duration: number = options.duration ?? 2000;
  const fps: number = options.fps ?? 30;
  const effect: AnimationEffect = options.effect ?? 'rainbow';
  const frames: number = Math.floor((duration / 1000) * fps);
  let seed: number = Math.floor(Math.random() * 1000);

  switch (effect) {
    case 'rainbow':
      await animateRainbow(text, frames, fps, seed);
      break;
    case 'wave':
      await animateWave(text, frames, fps);
      break;
    case 'pulse':
      await animatePulse(text, frames, fps);
      break;
    case 'typewriter':
      await animateTypewriter(text, fps);
      break;
    default:
      await animateRainbow(text, frames, fps, seed);
  }

  process.stdout.write('\n');
}

/**
 * Rainbow animation effect.
 */
async function animateRainbow(text: string, frames: number, fps: number, seed: number): Promise<void> {
  for (let i = 0; i < frames; i++) {
    lolcat.options.seed = seed + i;
    process.stdout.write(
      '\r' +
        lolcat.format(
          (char: string, color: LolcatColor) => `\x1b[38;2;${color.red};${color.green};${color.blue}m${char}`,
          text,
          () => {}
        )[0] +
        '\x1b[0m'
    );
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
}

/**
 * Wave animation effect.
 */
async function animateWave(text: string, frames: number, fps: number): Promise<void> {
  const chars: string[] = [...text];
  for (let i = 0; i < frames; i++) {
    let output: string = '\r';
    for (let j = 0; j < chars.length; j++) {
      const wave: number = Math.sin((i + j * 0.5) * 0.3) * 0.5 + 0.5;
      const hue: number = (i * 10 + j * 20) % 360;
      const rgb: [number, number, number] = hslToRgb(hue / 360, 0.8, 0.5 + wave * 0.3);
      output += `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${chars[j]}`;
    }
    output += '\x1b[0m';
    process.stdout.write(output);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
}

/**
 * Pulse animation effect.
 */
async function animatePulse(text: string, frames: number, fps: number): Promise<void> {
  const chars: string[] = [...text];
  for (let i = 0; i < frames; i++) {
    let output: string = '\r';
    const pulse: number = Math.sin(i * 0.2) * 0.3 + 0.7;
    for (let j = 0; j < chars.length; j++) {
      const hue: number = (j * 30) % 360;
      const rgb: [number, number, number] = hslToRgb(hue / 360, 0.8, 0.5 * pulse);
      output += `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${chars[j]}`;
    }
    output += '\x1b[0m';
    process.stdout.write(output);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
}

/**
 * Typewriter animation effect.
 */
async function animateTypewriter(text: string, fps: number): Promise<void> {
  const chars: string[] = [...text];
  for (let i = 0; i < chars.length; i++) {
    const hue: number = (i * 30) % 360;
    const rgb: [number, number, number] = hslToRgb(hue / 360, 0.8, 0.6);
    process.stdout.write(`\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${chars[i]}\x1b[0m`);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
}

/**
 * Convert HSL to RGB.
 * @param h - Hue (0-1).
 * @param s - Saturation (0-1).
 * @param l - Lightness (0-1).
 * @returns RGB values [r, g, b].
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q: number = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p: number = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ];
}

/**
 * Print text with a simple fade-in effect.
 * @param text - The text to animate.
 * @param duration - Animation duration in milliseconds.
 */
export async function printFadeIn(text: string, duration: number = 1000): Promise<void> {
  const steps: number = 20;
  const interval: number = duration / steps;

  for (let i = 0; i <= steps; i++) {
    const alpha: number = i / steps;
    const color: number = Math.round(255 * alpha);
    process.stdout.write(`\r${chalk.rgb(color, color, color)(text)}`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  process.stdout.write('\n');
}

/**
 * Print text with a bounce effect.
 * @param text - The text to animate.
 * @param duration - Animation duration in milliseconds.
 */
export async function printBounce(text: string, duration: number = 1500): Promise<void> {
  const steps: number = 30;
  const interval: number = duration / steps;

  for (let i = 0; i < steps; i++) {
    const bounce: number = Math.abs(Math.sin(i * 0.5)) * 3;
    const spaces: string = ' '.repeat(Math.floor(bounce));
    process.stdout.write(`\r${spaces}${chalk.cyan(text)}`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  process.stdout.write('\n');
}
