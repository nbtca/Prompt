// Print the ASCII logo from logo.txt.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

/**
 * Reads and prints the ASCII logo from logo.txt.
 */
export function printLogo(): void {
  const logoPath: string = path.resolve(__dirname, "./logo.txt");

  try {
    const data: string = fs.readFileSync(logoPath, "utf8");
    console.log(data.trim());
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      console.error("Error: logo.txt not found. Please ensure the file exists!");
    } else {
      console.error("Error reading logo.txt:", error.message);
    }
  }
}
