// Print a single line of text with animated lolcat-style rainbow colors.

import lolcat from 'isomorphic-lolcat';

/**
 * Print a line of text with animated lolcat rainbow effect.
 * @param {string} text - The text to animate.
 * @param {object} options - Animation options: { duration: ms, fps: number }
 */
export async function printLolcatAnimated(text, options = {}) {
  const duration = options.duration ?? 1500;
  const fps = options.fps ?? 30;
  const frames = Math.floor((duration / 1000) * fps);
  let seed = Math.floor(Math.random() * 1000);
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
  process.stdout.write('\n');
} 