#!/usr/bin/env node
import chalk from "chalk";
import figlet from "figlet";
import chalkAnimation from "chalk-animation";

const args = process.argv.slice(2);
const asJson = args.includes("--json");

const today = new Date();
const data = {
  date: today.toISOString(),
  weekDay: today.toLocaleString("zh-Cn", { weekday: "long" }),
};

if (asJson) {
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(chalk.blue(figlet.textSync("DATE")));
  const rainbow = chalkAnimation.rainbow("校园日期信息\n");
  setTimeout(() => {
    rainbow.stop();
    console.log(chalk.green(`今天是 ${data.weekDay}`));
    console.log(chalk.green(`日期：${today.toLocaleDateString()}`));
  }, 800);
}
