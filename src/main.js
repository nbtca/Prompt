// Main application flow for the NBTCA CLI tool.

import { printLogo } from './logo/printLogo.js';
import { printGradientText, archBlue, white } from './gradient/printGradientText.js';
import { printLolcatAnimated } from './animation/printLolcatAnimated.js';
import { showMainMenu } from './menu/showMainMenu.js';
import chalk from 'chalk';

/**
 * Main function: orchestrates the CLI welcome experience and menu.
 */
export async function main() {
  // Print ASCII logo
  printLogo();

  // Print welcome messages with blue-white gradient
  printGradientText("欢迎来到浙大宁波理工学院计算机协会！", archBlue, white);
  printGradientText("github.com/nbtca", archBlue, white);

  try {
    // Print animated lolcat-style slogan
    await printLolcatAnimated('To be at the intersection of technology and liberal arts.');
    await new Promise(r => setTimeout(r, 500));
    // Show interactive main menu
    await showMainMenu();
  } catch (err) {
    // Handle user interruption and unexpected errors
    if (
      err.message?.includes("SIGINT") ||
      err.constructor?.name === "ExitPromptError"
    ) {
      console.log(chalk.redBright("\nUser interrupted, program terminated."));
      process.exit(0);
    } else {
      console.error(chalk.red("Error occurred:"), err);
      process.exit(1);
    }
  }
} 