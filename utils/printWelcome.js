// utils/printWelcome.js
import chalk from "chalk";
import boxen from "boxen";

export function printWelcome() {
  const title = chalk.cyanBright.bold("欢迎使用我们组织的 CLI 工具！");
  const msg = boxen(title, {
    padding: 1,
    borderStyle: "round",
    borderColor: "cyan",
  });
  console.log(msg);
}
