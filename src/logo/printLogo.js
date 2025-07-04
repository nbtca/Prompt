// Print the ASCII logo from logo.txt.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reads and prints the ASCII logo from logo.txt.
 */
export function printLogo() {
  const logoPath = path.resolve(__dirname, "./logo.txt");

  try {
    const data = fs.readFileSync(logoPath, "utf8");
    console.log(data.trim());
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error("Error: logo.txt not found. Please ensure the file exists!");
    } else {
      console.error("Error reading logo.txt:", err.message);
    }
  }
}
