// Enhanced animated text with multiple effects and options.

import lolcat from 'isomorphic-lolcat';
import chalk from 'chalk';

/**
 * Print a line of text with enhanced lolcat rainbow effect.
 * @param {string} text - The text to animate.
 * @param {object} options - Animation options: { duration: ms, fps: number, effect: string }
 */
export async function printLolcatAnimated(text, options = {}) {
  const duration = options.duration ?? 2000;
  const fps = options.fps ?? 30;
  const effect = options.effect ?? 'rainbow';
  const frames = Math.floor((duration / 1000) * fps);
  let seed = Math.floor(Math.random() * 1000);
  
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
async function animateRainbow(text, frames, fps, seed) {
  for (let i = 0; i < frames; i++) {
    lolcat.options.seed = seed + i;
    process.stdout.write(
      '\r' +
        lolcat.format(
          (char, color) => `\x1b[38;2;${color.red};${color.green};${color.blue}m${char}`,
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
async function animateWave(text, frames, fps) {
  const chars = [...text];
  for (let i = 0; i < frames; i++) {
    let output = '\r';
    for (let j = 0; j < chars.length; j++) {
      const wave = Math.sin((i + j * 0.5) * 0.3) * 0.5 + 0.5;
      const hue = (i * 10 + j * 20) % 360;
      const rgb = hslToRgb(hue / 360, 0.8, 0.5 + wave * 0.3);
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
async function animatePulse(text, frames, fps) {
  const chars = [...text];
  for (let i = 0; i < frames; i++) {
    let output = '\r';
    const pulse = Math.sin(i * 0.2) * 0.3 + 0.7;
    for (let j = 0; j < chars.length; j++) {
      const hue = (j * 30) % 360;
      const rgb = hslToRgb(hue / 360, 0.8, 0.5 * pulse);
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
async function animateTypewriter(text, fps) {
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const hue = (i * 30) % 360;
    const rgb = hslToRgb(hue / 360, 0.8, 0.6);
    process.stdout.write(`\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${chars[i]}\x1b[0m`);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
}

/**
 * Convert HSL to RGB.
 * @param {number} h - Hue (0-1).
 * @param {number} s - Saturation (0-1).
 * @param {number} l - Lightness (0-1).
 * @returns {Array} RGB values [r, g, b].
 */
function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
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
 * @param {string} text - The text to animate.
 * @param {number} duration - Animation duration in milliseconds.
 */
export async function printFadeIn(text, duration = 1000) {
  const steps = 20;
  const interval = duration / steps;
  
  for (let i = 0; i <= steps; i++) {
    const alpha = i / steps;
    const color = Math.round(255 * alpha);
    process.stdout.write(`\r${chalk.rgb(color, color, color)(text)}`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  process.stdout.write('\n');
}

/**
 * Print text with a bounce effect.
 * @param {string} text - The text to animate.
 * @param {number} duration - Animation duration in milliseconds.
 */
export async function printBounce(text, duration = 1500) {
  const steps = 30;
  const interval = duration / steps;
  
  for (let i = 0; i < steps; i++) {
    const bounce = Math.abs(Math.sin(i * 0.5)) * 3;
    const spaces = ' '.repeat(Math.floor(bounce));
    process.stdout.write(`\r${spaces}${chalk.cyan(text)}`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  process.stdout.write('\n');
} 