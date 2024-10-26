// Print text with various gradient effects and colors.

export const archBlue: [number, number, number] = [23, 147, 209];
export const white: [number, number, number] = [255, 255, 255];
export const nbtcaGreen: [number, number, number] = [34, 197, 94];
export const nbtcaPurple: [number, number, number] = [147, 51, 234];
export const nbtcaOrange: [number, number, number] = [249, 115, 22];
export const nbtcaPink: [number, number, number] = [236, 72, 153];
export const nbtcaYellow: [number, number, number] = [234, 179, 8];

/**
 * Convert RGB values to ANSI escape code.
 */
function rgbToAnsi(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Linear interpolation between two colors.
 */
function lerpColor(color1: [number, number, number], color2: [number, number, number], t: number): [number, number, number] {
  return color1.map((c, i) => Math.round(c + (color2[i]! - c) * t)) as [number, number, number];
}

/**
 * Print text with a gradient effect.
 * @param text - The text to print.
 * @param startColor - Start color [r,g,b].
 * @param endColor - End color [r,g,b].
 */
export function printGradientText(
  text: string,
  startColor: [number, number, number] = archBlue,
  endColor: [number, number, number] = white,
): void {
  const chars: string[] = [...text];
  const len: number = chars.length;

  let output: string = "";
  for (let i = 0; i < len; i++) {
    const t: number = len === 1 ? 0 : i / (len - 1);
    const [r, g, b] = lerpColor(startColor, endColor, t);
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}

/**
 * Print text with rainbow gradient effect.
 * @param text - The text to print.
 */
export function printRainbowText(text: string): void {
  const colors: [number, number, number][] = [
    [255, 0, 0],    // Red
    [255, 127, 0],  // Orange
    [255, 255, 0],  // Yellow
    [0, 255, 0],    // Green
    [0, 0, 255],    // Blue
    [75, 0, 130],   // Indigo
    [148, 0, 211]   // Violet
  ];

  const chars: string[] = [...text];
  const len: number = chars.length;

  let output: string = "";
  for (let i = 0; i < len; i++) {
    const colorIndex: number = (i / len) * (colors.length - 1);
    const color1Index: number = Math.floor(colorIndex);
    const color2Index: number = Math.min(color1Index + 1, colors.length - 1);
    const t: number = colorIndex - color1Index;

    const [r, g, b] = lerpColor(colors[color1Index]!, colors[color2Index]!, t);
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}

/**
 * Print text with pulsing effect.
 * @param text - The text to print.
 * @param baseColor - Base color [r,g,b].
 */
export function printPulsingText(text: string, baseColor: [number, number, number] = archBlue): void {
  const chars: string[] = [...text];
  const len: number = chars.length;

  let output: string = "";
  for (let i = 0; i < len; i++) {
    const pulse: number = Math.sin(i * 0.5) * 0.3 + 0.7;
    const [r, g, b] = baseColor.map(c => Math.round(c * pulse)) as [number, number, number];
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}
