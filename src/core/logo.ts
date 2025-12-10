/**
 * Smart logo display module
 * Attempts to display iTerm2 image format logo, falls back to ASCII art
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import gradient from 'gradient-string';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create blue-toned gradient effect
 */
function createBlueGradient(text: string): string {
  // Blue gradient: deep blue -> sky blue -> cyan
  const blueGradient = gradient([
    { color: '#1e3a8a', pos: 0 },    // Deep blue
    { color: '#0ea5e9', pos: 0.5 },  // Sky blue
    { color: '#06b6d4', pos: 1 }     // Cyan
  ]);
  return blueGradient(text);
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1]!, 16), parseInt(result[2]!, 16), parseInt(result[3]!, 16)]
    : [0, 0, 0];
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Linear interpolation between two colors
 */
function interpolateColor(color1: string, color2: string, factor: number): string {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);

  const r = r1 + (r2 - r1) * factor;
  const g = g1 + (g2 - g1) * factor;
  const b = b1 + (b2 - b1) * factor;

  return rgbToHex(r, g, b);
}

/**
 * Easing function - smooth in-out effect
 */
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * Display gradient animation effect (optimized - truly smooth animation)
 */
async function animateGradient(text: string, duration: number = 1200): Promise<void> {
  const frames = 60; // 60 frames for truly smooth animation
  const frameDelay = duration / frames;

  // Define color sequence - forms complete blue spectrum cycle
  const colorSequence = [
    '#1e3a8a', // Deep blue
    '#2563eb', // Blue
    '#3b82f6', // Bright blue
    '#0ea5e9', // Sky blue
    '#06b6d4', // Cyan
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#0ea5e9', // Sky blue
    '#3b82f6', // Bright blue
    '#2563eb', // Blue
    '#1e3a8a', // Deep blue
  ];

  for (let i = 0; i < frames; i++) {
    // Use smooth sine easing
    const progress = easeInOutSine(i / frames);

    // Calculate position in color sequence
    const position = progress * (colorSequence.length - 1);
    const index1 = Math.floor(position);
    const index2 = Math.min(index1 + 1, colorSequence.length - 1);
    const localProgress = position - index1;

    // Interpolate between adjacent colors, generating three smoothly transitioning colors
    const color1 = interpolateColor(
      colorSequence[index1]!,
      colorSequence[index2]!,
      localProgress
    );

    const nextIndex1 = Math.min(index2, colorSequence.length - 1);
    const nextIndex2 = Math.min(nextIndex1 + 1, colorSequence.length - 1);
    const color2 = interpolateColor(
      colorSequence[nextIndex1]!,
      colorSequence[nextIndex2]!,
      localProgress
    );

    const nextIndex3 = Math.min(nextIndex2, colorSequence.length - 1);
    const nextIndex4 = Math.min(nextIndex3 + 1, colorSequence.length - 1);
    const color3 = interpolateColor(
      colorSequence[nextIndex3]!,
      colorSequence[nextIndex4]!,
      localProgress
    );

    // Create gradient for current frame
    const frameGradient = gradient(color1, color2, color3);

    // Clear current line and display new frame
    process.stdout.write('\r' + frameGradient(text));

    await new Promise(resolve => setTimeout(resolve, frameDelay));
  }

  // Finally display static blue gradient
  process.stdout.write('\r' + createBlueGradient(text) + '\n');
}

/**
 * Attempt to read and display logo file
 */
export async function printLogo(): Promise<void> {
  try {
    // Try to read iTerm2 image format logo
    const logoPath = join(__dirname, '../logo/logo.txt');
    const logoContent = readFileSync(logoPath, 'utf-8');

    // If successfully read and content is valid, display directly
    if (logoContent && logoContent.length > 100) {
      console.log(logoContent);
      await printDescription();
      return;
    }
  } catch (error) {
    // iTerm2 logo read failed, continue trying ASCII logo
  }

  // Fallback: display ASCII art logo
  try {
    const asciiLogoPath = join(__dirname, '../logo/ascii-logo.txt');
    const asciiContent = readFileSync(asciiLogoPath, 'utf-8');

    // Display ASCII logo with gradient colors
    console.log();
    const lines = asciiContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(createBlueGradient(line));
    });

    await printDescription();
  } catch (error) {
    // If ASCII logo also fails, display simple text logo
    console.log();
    console.log(createBlueGradient('  NBTCA'));
    await printDescription();
  }
}

/**
 * Display description text (with gradient animation)
 */
async function printDescription(): Promise<void> {
  const tagline = 'To be at the intersection of technology and liberal arts.';

  console.log();

  // Display gradient animation
  await animateGradient(tagline, 1500);

  console.log();
}

