/**
 * ICS日历功能模块
 * 从远程获取并显示近期活动
 */

import axios from 'axios';
import ICAL from 'ical.js';
import chalk from 'chalk';
import { error, info, printDivider } from '../core/ui.js';

/**
 * 活动接口
 */
export interface Event {
  date: string;
  time: string;
  title: string;
  location: string;
  startDate: Date;
}

/**
 * 从远程获取ICS文件并解析活动
 */
export async function fetchEvents(): Promise<Event[]> {
  try {
    const response = await axios.get('https://ical.nbtca.space', {
      timeout: 5000,
      headers: {
        'User-Agent': 'NBTCA-CLI/2.3.1'
      }
    });

    const jcalData = ICAL.parse(response.data);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events: Event[] = [];
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      const startDate = event.startDate.toJSDate();

      // 只显示未来30天内的活动
      if (startDate >= now && startDate <= thirtyDaysLater) {
        events.push({
          date: formatDate(startDate),
          time: formatTime(startDate),
          title: event.summary || '未命名活动',
          location: event.location || '待定',
          startDate: startDate
        });
      }
    }

    // 按日期排序
    events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    return events;
  } catch (err) {
    throw new Error('获取活动日历失败');
  }
}

/**
 * 以表格形式显示活动
 */
export function displayEvents(events: Event[]): void {
  if (events.length === 0) {
    info('近期暂无活动安排');
    return;
  }

  console.log();
  console.log(chalk.cyan.bold('  近期活动') + chalk.gray(` (最近30天)`));
  console.log();

  // 表头
  const dateWidth = 14;
  const titleWidth = 25;
  const locationWidth = 15;

  console.log(
    '  ' +
    chalk.bold('日期时间'.padEnd(dateWidth)) +
    chalk.bold('活动名称'.padEnd(titleWidth)) +
    chalk.bold('地点')
  );

  printDivider();

  // 活动列表
  events.forEach(event => {
    const dateTime = `${event.date} ${event.time}`.padEnd(dateWidth);
    const title = truncate(event.title, titleWidth - 2).padEnd(titleWidth);
    const location = truncate(event.location, locationWidth);

    console.log(
      '  ' +
      chalk.cyan(dateTime) +
      chalk.white(title) +
      chalk.gray(location)
    );
  });

  console.log();
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/**
 * 格式化时间
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 截断字符串
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * 主函数：获取并显示活动
 */
export async function showCalendar(): Promise<void> {
  try {
    info('正在获取活动日历...');
    const events = await fetchEvents();
    console.log('\r' + ' '.repeat(50) + '\r'); // 清除加载提示
    displayEvents(events);
  } catch (err) {
    error('无法获取活动日历');
    console.log(chalk.gray('  请稍后重试或访问 https://nbtca.space'));
    console.log();
  }
}
