// Enhanced user action handler with multiple services and features.

import chalk from "chalk";
import {
  showOfficialSubMenu,
  showTechSubMenu,
  showLearningSubMenu,
  showCommunitySubMenu,
  showSettingsSubMenu,
  showHelpSubMenu
} from "./subMenu.js";
import { printErrorMessage, printWarningMessage } from "../ui/welcomeBanner.js";
import type { MenuAction } from "../types.js";

/**
 * Enhanced action handler with multiple categories and services.
 * @param action - The selected action.
 */
export async function handleUserAction(action: MenuAction): Promise<void> {
  try {
    switch (action) {
      case "official":
        await showOfficialSubMenu();
        break;

      case "tech":
        await showTechSubMenu();
        break;

      case "learning":
        await showLearningSubMenu();
        break;

      case "community":
        await showCommunitySubMenu();
        break;

      case "settings":
        await showSettingsSubMenu();
        break;

      case "help":
        await showHelpSubMenu();
        break;

      // Legacy actions for backward compatibility
      case "exit":
        console.log(chalk.blue("👋 感谢使用 NBTCA Welcome！再见！"));
        process.exit(0);
        break;

      case "back":
        // Return to main menu
        break;

      default:
        printWarningMessage(`未知操作: ${action}`);
        console.log(chalk.yellow("💡 提示: 请从菜单中选择有效选项"));
    }
  } catch (error) {
    const err = error as Error;
    printErrorMessage(`处理操作时发生错误: ${err.message}`);
  }
}
