// Print text with a horizontal blue-white gradient.

export const archBlue = [23, 147, 209];
export const white = [255, 255, 255];

/**
 * Convert RGB values to ANSI escape code.
 */
function rgbToAnsi(r, g, b) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Linear interpolation between two colors.
 */
function lerpColor(color1, color2, t) {
  return color1.map((c, i) => Math.round(c + (color2[i] - c) * t));
}

/**
 * Print text with a blue-white gradient.
 * @param {string} text - The text to print.
 * @param {Array} startColor - Start color [r,g,b].
 * @param {Array} endColor - End color [r,g,b].
 */
export function printGradientText(
  text,
  startColor = archBlue,
  endColor = white,
) {
  const chars = [...text];
  const len = chars.length;

  let output = "";
  for (let i = 0; i < len; i++) {
    const t = len === 1 ? 0 : i / (len - 1);
    const [r, g, b] = lerpColor(startColor, endColor, t);
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}
