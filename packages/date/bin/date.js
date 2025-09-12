#!/usr/bin/env node
import chalk from "chalk";
import figlet from "figlet";
import chalkAnimation from "chalk-animation";
import dayjs from "dayjs";
import lunar from "chinese-lunar";
import {
  getHolidayToday,
  getNextHoliday,
  getWeatherNingbo,
} from "../lib/api.js";
import { renderWeather, renderHoliday } from "../lib/render.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");

const now = new Date();
const lunarDate = lunar.solarToLunar(now);

const data = {
  iso: now.toISOString(),
  date: dayjs(now).format("YYYY-MM-DD HH:mm:ss"),
  weekday: dayjs(now).format("dddd"),
  lunar: `${lunarDate.year}年${lunarDate.month}月${lunarDate.day}日`,
};

(async () => {
  if (asJson) {
    const [holiday, nextHoliday, weather] = await Promise.all([
      getHolidayToday(),
      getNextHoliday(),
      getWeatherNingbo(),
    ]);
    console.log(
      JSON.stringify({ ...data, holiday, nextHoliday, weather }, null, 2),
    );
    return;
  }

  console.log(chalk.blue(figlet.textSync("Times")));
  const rainbow = chalkAnimation.rainbow("NBTCA为您天气预报😋\n");
  await new Promise((resolve) => setTimeout(resolve, 800));
  rainbow.stop();

  console.log(chalk.green(`此刻：${data.date} (${data.weekday})`));
  console.log(chalk.yellow(`农历：${data.lunar}`));

  // 节假日
  try {
    const [holiday, nextHoliday] = await Promise.all([
      getHolidayToday(),
      getNextHoliday(),
    ]);
    renderHoliday(holiday, nextHoliday);
  } catch (e) {
    console.log(chalk.red("⚠ 无法获取节假日信息"));
  }

  // 天气
  try {
    const weather = await getWeatherNingbo();
    renderWeather(weather);
  } catch (e) {
    console.log(chalk.red("⚠ 无法获取宁波天气"));
  }
})();
