// cli/mainMenu.js
import inquirer from "inquirer";
import chalk from "chalk";
import open from "open";

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

  switch (action) {
    case "official":
      console.log(chalk.blue("正在前往NBTCA主页..."));
      await open("https://nbtca.space/");
      break;
    case "repair":
      console.log(chalk.blue("正在获取维修队主页..."));
      await open("https://nbtca.space/repair/");
      break;
    case "mirror":
      console.log(chalk.blue("正在前往NBTCA内网镜像站..."));
      await open("https://i.nbtca.space/");
      break;
  }
}
