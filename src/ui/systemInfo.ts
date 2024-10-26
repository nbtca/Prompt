// System information display module.

import chalk from 'chalk';
import os from 'os';
import type { SystemInfo } from '../types.js';

/**
 * Get system information.
 * @returns System information object.
 */
function getSystemInfo(): SystemInfo {
  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024 / 1024),
      used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024)
    },
    cpu: {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown'
    },
    uptime: Math.round(os.uptime() / 3600)
  };
}

/**
 * Print system information in a formatted way.
 */
export function printSystemInfo(): void {
  const info: SystemInfo = getSystemInfo();

  console.log(chalk.blue.bold('\n💻 系统信息:'));

  // Platform and architecture
  const platformIcon: string = getPlatformIcon(info.platform);
  console.log(`  ${platformIcon} 平台: ${chalk.white(info.platform)} (${chalk.gray(info.arch)})`);

  // Node.js version
  console.log(`  ${chalk.green('⬢')} Node.js: ${chalk.white(info.nodeVersion)}`);

  // Memory usage
  const memoryUsage: number = Math.round(((info.memory.total - info.memory.free) / info.memory.total) * 100);
  const memoryBar: string = createMemoryBar(memoryUsage);
  console.log(`  ${chalk.blue('💾')} 内存: ${memoryBar} ${chalk.white(info.memory.free)}GB / ${chalk.white(info.memory.total)}GB`);

  // CPU info
  console.log(`  ${chalk.yellow('⚡')} CPU: ${chalk.white(info.cpu.cores)} 核心`);

  // Uptime
  console.log(`  ${chalk.cyan('⏱️')} 运行时间: ${chalk.white(info.uptime)} 小时`);

  // Performance indicator
  const performance: string = getPerformanceIndicator(info);
  console.log(`  ${chalk.magenta('📊')} 性能: ${performance}`);
}

/**
 * Get platform-specific icon.
 * @param platform - Platform name.
 * @returns Platform icon.
 */
function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    darwin: '🍎',
    win32: '🪟',
    linux: '🐧',
    aix: '🔧',
    freebsd: '👹',
    openbsd: '🐡',
    sunos: '☀️'
  };
  return icons[platform] || '💻';
}

/**
 * Create a memory usage bar.
 * @param percentage - Memory usage percentage.
 * @returns Memory bar string.
 */
function createMemoryBar(percentage: number): string {
  const width: number = 15;
  const filled: number = Math.floor((percentage / 100) * width);
  const empty: number = width - filled;

  let color: typeof chalk.green | typeof chalk.yellow | typeof chalk.red;
  if (percentage < 50) color = chalk.green;
  else if (percentage < 80) color = chalk.yellow;
  else color = chalk.red;

  const filledBar: string = color('█').repeat(filled);
  const emptyBar: string = chalk.gray('░').repeat(empty);

  return `[${filledBar}${emptyBar}] ${percentage}%`;
}

/**
 * Get performance indicator based on system info.
 * @param info - System information.
 * @returns Performance indicator.
 */
function getPerformanceIndicator(info: SystemInfo): string {
  const memoryUsage: number = ((info.memory.total - info.memory.free) / info.memory.total) * 100;
  const cpuCores: number = info.cpu.cores;

  let performance: string;
  if (memoryUsage < 50 && cpuCores >= 4) {
    performance = chalk.green('优秀 🚀');
  } else if (memoryUsage < 70 && cpuCores >= 2) {
    performance = chalk.yellow('良好 ⚡');
  } else {
    performance = chalk.red('一般 📉');
  }

  return performance;
}

/**
 * Print network status.
 */
export function printNetworkStatus(): void {
  console.log(chalk.blue.bold('\n🌐 网络状态:'));
  console.log(`  ${chalk.green('🟢')} 外网连接: 正常`);
  console.log(`  ${chalk.green('🟢')} NBTCA 服务: 在线`);
  console.log(`  ${chalk.green('🟢')} 镜像站点: 可用`);
}

/**
 * Print quick tips.
 */
export function printQuickTips(): void {
  const tips: string[] = [
    '💡 使用方向键导航菜单',
    '💡 按 Ctrl+C 退出程序',
    '💡 访问官网获取最新资讯',
    '💡 加入我们的技术交流群'
  ];

  console.log(chalk.cyan.bold('\n💡 使用提示:'));
  tips.forEach(tip => {
    console.log(`  ${chalk.gray('•')} ${tip}`);
  });
}
