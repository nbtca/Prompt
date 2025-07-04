// cli/mainMenu.js
import inquirer from "inquirer";
import chalk from "chalk";
import { handleUserAction } from "./handleUserAction.js";

// Show the interactive main menu and handle user selection.

/**
 * Display the main menu and delegate action handling.
 */
export async function showMainMenu() {
  const choices = [
    { name: "🌐 访问NBTCA的官网", value: "official" },
    { name: "🔧 获取NBTCA的服务", value: "repair" },
    { name: "🚀 访问我们的内网镜像站", value: "mirror" },
  ];

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: chalk.green("请选择要执行的操作："),
      choices,
    },
  ]);

  await handleUserAction(action);
}
