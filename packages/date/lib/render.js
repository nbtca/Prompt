import chalk from "chalk";
import asciichart from "asciichart";

// 天气渲染
export function renderWeather(weather) {
  console.log(chalk.cyan("\n🌤 宁波实时天气："));
  const cur = weather.current;
  console.log(
    `  温度: ${chalk.red(cur.temperature)}°C  风速: ${cur.windspeed} km/h`,
  );

  // 温度趋势折线图
  const highs = weather.daily.map((d) => d.high);
  console.log(chalk.red("\n📈 未来最高气温趋势："));
  console.log(asciichart.plot(highs, { height: 6 }));

  // 未来几天天气
  console.log(chalk.green("\n📅 未来几天天气预报："));
  weather.daily.slice(0, 5).forEach((d) => {
    const icon = d.weathercode <= 1 ? "☀️" : d.weathercode <= 3 ? "⛅" : "🌧️";
    console.log(`  ${d.date}  ${icon}  高:${d.high}°C  低:${d.low}°C`);
  });
}

// 节假日渲染
export function renderHoliday(todayHoliday, nextHoliday) {
  if (todayHoliday?.holiday?.name) {
    console.log(chalk.magenta(`🎉 今天是假期: ${todayHoliday.holiday.name}`));
  } else {
    console.log(chalk.gray("今天非法定假日"));
    if (nextHoliday?.name && nextHoliday?.rest) {
      const days = nextHoliday.rest;
      console.log(chalk.yellow(`⏳ 距离 ${nextHoliday.name} 还有 ${days} 天`));
      const barLength = 20;
      const filled = Math.min(barLength, Math.max(0, barLength - days));
      const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
      console.log(`[${bar}] ${filled}/${barLength}`);
    }
  }
}
