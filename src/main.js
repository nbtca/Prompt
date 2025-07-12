// Main application flow for the NBTCA CLI tool.

import { printLogo } from './logo/printLogo.js';
import { printGradientText, archBlue, white, nbtcaGreen, nbtcaPurple } from './gradient/printGradientText.js';
import { printLolcatAnimated } from './animation/printLolcatAnimated.js';
import { showMainMenu } from './menu/showMainMenu.js';
import { showLoadingAnimation } from './animation/loadingAnimation.js';
import { printWelcomeBanner } from './ui/welcomeBanner.js';
import { printSystemInfo } from './ui/systemInfo.js';
import chalk from 'chalk';

/**
 * Main function: orchestrates the CLI welcome experience and menu.
 */
export async function main() {
  try {
    // Clear screen and show loading
    console.clear();
    await showLoadingAnimation("正在启动 NBTCA Welcome...", 2000);
    
    // Print ASCII logo with enhanced styling
    printLogo();
    
    // Print enhanced welcome banner
    printWelcomeBanner();
    
    // Print welcome messages with enhanced gradient
    printGradientText("欢迎来到浙大宁波理工学院计算机协会！", archBlue, white);
    printGradientText("Welcome to NBTCA - NingboTech Computer Association", nbtcaGreen, nbtcaPurple);
    printGradientText("github.com/nbtca", archBlue, white);
    
    // Print system information
    printSystemInfo();
    
    // Print animated lolcat-style slogan with enhanced timing
    await printLolcatAnimated('To be at the intersection of technology and liberal arts.', {
      duration: 2000,
      fps: 25
    });
    
    await new Promise(r => setTimeout(r, 800));
    
    // Show interactive main menu with enhanced options
    await showMainMenu();
    
  } catch (err) {
    // Enhanced error handling
    if (
      err.message?.includes("SIGINT") ||
      err.constructor?.name === "ExitPromptError"
    ) {
      console.log(chalk.redBright("\n👋 感谢使用 NBTCA Welcome！再见！"));
      process.exit(0);
    } else {
      console.error(chalk.red("❌ 发生错误:"), err);
      console.log(chalk.yellow("💡 提示: 请检查网络连接或稍后重试"));
      process.exit(1);
    }
  }
} 