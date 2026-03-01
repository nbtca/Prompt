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
  const blueGradient = gradient([
    { color: '#1e3a8a', pos: 0 },    // Deep blue
    { color: '#0ea5e9', pos: 0.5 },  // Sky blue
    { color: '#06b6d4', pos: 1 }     // Cyan
  ]);
  return blueGradient(text);
}

/**
 * Display description text (instant, no animation)
 */
function printDescription(): void {
  const tagline = 'To be at the intersection of technology and liberal arts.';
  console.log();
  if (process.env['NO_COLOR']) {
    console.log(tagline);
  } else {
    console.log(createBlueGradient(tagline));
  }
  console.log();
}

/**
 * Attempt to read and display logo file
 */
export async function printLogo(): Promise<void> {
  if (!process.stdout.isTTY) {
    return;
  }

  try {
    const logoPath = join(__dirname, '../logo/logo.txt');
    const logoContent = readFileSync(logoPath, 'utf-8');
    if (logoContent && logoContent.length > 100) {
      console.log(logoContent);
      printDescription();
      return;
    }
  } catch {
    // iTerm2 logo read failed, continue trying ASCII logo
  }

  try {
    const asciiLogoPath = join(__dirname, '../logo/ascii-logo.txt');
    const asciiContent = readFileSync(asciiLogoPath, 'utf-8');
    console.log();
    const lines = asciiContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(createBlueGradient(line));
    });
    printDescription();
  } catch {
    console.log();
    console.log(createBlueGradient('  NBTCA'));
    printDescription();
  }
}
