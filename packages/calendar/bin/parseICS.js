import fs from "fs";
import ical from "node-ical";

// 预处理 ICS 文本
export function preprocessICS(filePath) {
  let data = fs.readFileSync(filePath, "utf8");
  // 去掉多余空行、统一换行符
  data = data.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n");
  return data;
}

// 解析 ICS 文件，返回事件列表
export function parseEvents(icsText) {
  const events = ical.parseICS(icsText);
  return Object.values(events)
    .filter((e) => e.type === "VEVENT")
    .map((e) => ({
      title: e.summary,
      start: e.start,
      end: e.end,
      location: e.location || "",
      desc: e.description || "",
      rrule: e.rrule || null,
    }));
}

// 获取未来 n 个最近事件（可展开重复事件）
export function getUpcomingEvents(events, n = 10) {
  const now = new Date();
  let list = [];

  for (const e of events) {
    if (e.rrule) {
      // 展开重复事件，取未来两年内
      const dates = e.rrule.between(
        now,
        new Date(now.getFullYear() + 2, 11, 31),
      );
      dates.forEach((d) => list.push({ ...e, start: d }));
    } else if (e.start >= now) {
      list.push(e);
    }
  }

  list.sort((a, b) => a.start - b.start);
  return list.slice(0, n);
}
