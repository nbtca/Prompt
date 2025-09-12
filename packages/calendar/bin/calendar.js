#!/usr/bin/env node
import { fetch } from "undici";
import ical from "node-ical";
import chalk from "chalk";
import ora from "ora";

const args = process.argv.slice(2);
const asJson = args.includes("--json");

const ICS_URL = "https://ical.nbtca.space/calendar.ics";

async function main() {
  const spinner = ora("加载日历...").start();
  try {
    const res = await fetch(ICS_URL);
    if (!res.ok) throw new Error("无法获取 ICS 文件");
    const text = await res.text();
    const events = ical.parseICS(text);
    spinner.succeed("加载完成");

    const now = new Date();
    const upcoming = Object.values(events)
      .filter((e) => e.type === "VEVENT" && e.start > now)
      .sort((a, b) => a.start - b.start);

    const nextEvent = upcoming[0] || null;

    if (asJson) console.log(JSON.stringify({ nextEvent }, null, 2));
    else if (nextEvent) {
      console.log(chalk.cyan(`下一次活动：${nextEvent.summary}`));
      console.log(chalk.green(`时间：${nextEvent.start}`));
      if (nextEvent.location)
        console.log(chalk.yellow(`地点：${nextEvent.location}`));
    } else console.log(chalk.dim("暂无未来活动"));
  } catch (err) {
    spinner.fail("加载失败");
    console.error(err);
    process.exit(1);
  }
}

main();
