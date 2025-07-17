// Print text with various gradient effects and colors.

export const archBlue = [23, 147, 209];
export const white = [255, 255, 255];
export const nbtcaGreen = [34, 197, 94];
export const nbtcaPurple = [147, 51, 234];
export const nbtcaOrange = [249, 115, 22];
export const nbtcaPink = [236, 72, 153];
export const nbtcaYellow = [234, 179, 8];

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
 * Print text with a gradient effect.
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

/**
 * Print text with rainbow gradient effect.
 * @param {string} text - The text to print.
 */
export function printRainbowText(text) {
  const colors = [
    [255, 0, 0],    // Red
    [255, 127, 0],  // Orange
    [255, 255, 0],  // Yellow
    [0, 255, 0],    // Green
    [0, 0, 255],    // Blue
    [75, 0, 130],   // Indigo
    [148, 0, 211]   // Violet
  ];
  
  const chars = [...text];
  const len = chars.length;
  
  let output = "";
  for (let i = 0; i < len; i++) {
    const colorIndex = (i / len) * (colors.length - 1);
    const color1Index = Math.floor(colorIndex);
    const color2Index = Math.min(color1Index + 1, colors.length - 1);
    const t = colorIndex - color1Index;
    
    const [r, g, b] = lerpColor(colors[color1Index], colors[color2Index], t);
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}

/**
 * Print text with pulsing effect.
 * @param {string} text - The text to print.
 * @param {Array} baseColor - Base color [r,g,b].
 */
export function printPulsingText(text, baseColor = archBlue) {
  const chars = [...text];
  const len = chars.length;
  
  let output = "";
  for (let i = 0; i < len; i++) {
    const pulse = Math.sin(i * 0.5) * 0.3 + 0.7;
    const [r, g, b] = baseColor.map(c => Math.round(c * pulse));
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}
