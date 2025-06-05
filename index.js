#!/usr/bin/env node

import { printGradientText, archBlue, white } from "./utils/colorGradient.js";
import { printLogo } from "./utils/printLogo.js";
import chalk from "chalk";
import { printWelcome } from "./utils/printWelcome.js";
import { showMainMenu } from "./utils/cli.js";

// 打印 logo（无渐变）
printLogo();

// 打印欢迎语和 GitHub（渐变）
printGradientText("欢迎来到浙大宁波理工学院计算机协会！", archBlue, white);
printGradientText("github.com/nbtca", archBlue, white);

try {
  printWelcome();
  await showMainMenu();
} catch (err) {
  if (
    err.message?.includes("SIGINT") ||
    err.constructor?.name === "ExitPromptError"
  ) {
    console.log(chalk.redBright("\n用户中断操作，程序已终止。"));
    process.exit(0);
  } else {
    // 其他错误显示原始报错（调试用）
    console.error(chalk.red("发生错误："), err);
    process.exit(1);
  }
}
