import chalk from "chalk";
import Table from "cli-table3";

export function displayEvents(events) {
  const table = new Table({
    head: [chalk.blue("时间"), chalk.green("事件"), chalk.yellow("地点")],
    style: { head: [], border: [] },
  });

  events.forEach((ev) => {
    table.push([
      chalk.cyan(ev.start.toLocaleString("zh-CN")),
      chalk.bold(ev.title),
      ev.location,
    ]);
  });

  console.log(chalk.magenta("📅 最近事件清单"));
  console.log(table.toString());
}
