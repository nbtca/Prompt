#!/usr/bin/env node
import { fetch } from "undici";
import ical from "node-ical";
import chalk from "chalk";
import ora from "ora";
import dayjs from "dayjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const ICS_URL = "https://ical.nbtca.space/nbtca.ics";

async function main() {
  const spinner = ora("加载 ICS 日历...").start();
  try {
    const res = await fetch(ICS_URL);
    if (!res.ok) throw new Error(`请求失败 ${res.status}`);
    const text = await res.text();
    const events = ical.parseICS(text);

    const now = dayjs();
    const nextMonth = now.add(1, "month");
    const upcoming = Object.values(events)
      .filter(
        (e) =>
          e.type === "VEVENT" &&
          dayjs(e.start).isAfter(now) &&
          dayjs(e.start).isBefore(nextMonth),
      )
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    if (asJson) console.log(JSON.stringify({ events: upcoming }, null, 2));
    else {
      console.log(chalk.bold("未来一个月事件："));
      upcoming.forEach((e) => {
        console.log(
          chalk.cyan(e.summary),
          chalk.green(dayjs(e.start).format("MM-DD HH:mm")),
        );
        if (e.location) console.log(chalk.yellow(`地点: ${e.location}`));
      });
    }
    spinner.succeed("加载完成");
  } catch (err) {
    spinner.fail("加载失败");
    console.error(err);
    process.exit(1);
  }
}

main();
