// Enhanced main menu with multiple categories and sub-menus.

import inquirer from "inquirer";
import chalk from "chalk";
import { handleUserAction } from "./handleUserAction.js";
// Import specific sub-menu functions as needed
import { printSeparator } from "../ui/welcomeBanner.js";

/**
 * Display the enhanced main menu with categories.
 */
export async function showMainMenu() {
  const mainChoices = [
    { name: "🌐 官方网站服务", value: "official" },
    { name: "🔧 技术支持服务", value: "tech" },
    { name: "📚 学习资源中心", value: "learning" },
    { name: "👥 社区交流", value: "community" },
    { name: "⚙️ 系统设置", value: "settings" },
    { name: "❓ 帮助与关于", value: "help" },
    { name: "🚪 退出程序", value: "exit" }
  ];

  printSeparator("主菜单", "dashed");
  
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: chalk.green("🎯 请选择要访问的服务类别："),
      choices: mainChoices,
      pageSize: 10
    },
  ]);

  if (action === "exit") {
    console.log(chalk.blue("👋 感谢使用 NBTCA Welcome！再见！"));
    process.exit(0);
  }

  await handleUserAction(action);
}

/**
 * Show a sub-menu for specific categories.
 * @param {string} category - Category name.
 * @param {Array} choices - Menu choices.
 */
export async function showCategoryMenu(category, choices) {
  printSeparator(category, "dashed");
  
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: chalk.cyan(`请选择 ${category} 中的服务：`),
      choices: choices,
      pageSize: 8
    },
  ]);

  return action;
}

/**
 * Show a confirmation dialog.
 * @param {string} message - Confirmation message.
 * @returns {boolean} User confirmation.
 */
export async function showConfirmation(message) {
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: chalk.yellow(message),
      default: true
    },
  ]);

  return confirmed;
}

/**
 * Show a text input prompt.
 * @param {string} message - Input message.
 * @param {string} defaultValue - Default value.
 * @returns {string} User input.
 */
export async function showTextInput(message, defaultValue = "") {
  const { input } = await inquirer.prompt([
    {
      type: "input",
      name: "input",
      message: chalk.blue(message),
      default: defaultValue
    },
  ]);

  return input;
}

/**
 * Show a password input prompt.
 * @param {string} message - Password message.
 * @returns {string} User password.
 */
export async function showPasswordInput(message) {
  const { password } = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      message: chalk.red(message),
      mask: "*"
    },
  ]);

  return password;
}
