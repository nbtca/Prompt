#!/usr/bin/env node
import figlet from "figlet";
import chalk from "chalk";
import inquirer from "inquirer";
import { spawn } from "child_process";

// 欢迎标题
console.log(chalk.blue(figlet.textSync("NBTCA CLI")));
console.log(chalk.green("欢迎使用 NBTCA 工具集！\n"));

async function mainMenu() {
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "tool",
      message: "请选择要使用的工具：",
      choices: [
        { name: "📅 日期与天气 (date)", value: "date" },
        { name: "💻 GitHub 组织动态 (github)", value: "github" },
        { name: "🗓 最近活动 (calendar)", value: "calendar" },
        { name: "🚪 退出", value: "exit" },
      ],
    },
  ]);

  switch (answer.tool) {
    case "date":
      await runTool("@nbtca/date");
      break;
    case "github":
      await runTool("@nbtca/github");
      break;
    case "calendar":
      await runTool("@nbtca/calendar");
      break;
    case "exit":
    default:
      console.log(chalk.yellow("再见！"));
      process.exit(0);
  }

  mainMenu();
}

// 调用依赖包 bin 文件
function runTool(pkgName) {
  return new Promise((resolve) => {
    // require.resolve 找到 bin
    const binPath = require.resolve(
      `${pkgName}/bin/${pkgName.split("/")[1]}.js`,
    );
    const child = spawn("node", [binPath], { stdio: "inherit" });
    child.on("exit", () => resolve());
  });
}

mainMenu();
