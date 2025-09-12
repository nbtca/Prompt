import fetch from "node-fetch";

// 节假日接口
export async function getHolidayToday() {
  const resp = await fetch("https://timor.tech/api/holiday/today");
  const j = await resp.json();
  return j;
}

export async function getNextHoliday() {
  const resp = await fetch("https://timor.tech/api/holiday/next");
  const j = await resp.json();
  return j;
}

// 宁波天气接口 (Open-Meteo 免费 API，无需注册)
export async function getWeatherNingbo() {
  const lat = 29.8683;
  const lon = 121.5495;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&current_weather=true&timezone=Asia/Shanghai`;

  const resp = await fetch(url);
  const data = await resp.json();

  // 整理为方便渲染的格式
  return {
    current: data.current_weather,
    daily: data.daily.time.map((d, i) => ({
      date: d,
      high: data.daily.temperature_2m_max[i],
      low: data.daily.temperature_2m_min[i],
      weathercode: data.daily.weathercode[i],
    })),
  };
}
