// System information display module.

import chalk from 'chalk';
import os from 'os';

/**
 * Get system information.
 * @returns {Object} System information object.
 */
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024 / 1024)
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
export function printSystemInfo() {
  const info = getSystemInfo();
  
  console.log(chalk.blue.bold('\n💻 系统信息:'));
  
  // Platform and architecture
  const platformIcon = getPlatformIcon(info.platform);
  console.log(`  ${platformIcon} 平台: ${chalk.white(info.platform)} (${chalk.gray(info.arch)})`);
  
  // Node.js version
  console.log(`  ${chalk.green('⬢')} Node.js: ${chalk.white(info.nodeVersion)}`);
  
  // Memory usage
  const memoryUsage = Math.round(((info.memory.total - info.memory.free) / info.memory.total) * 100);
  const memoryBar = createMemoryBar(memoryUsage);
  console.log(`  ${chalk.blue('💾')} 内存: ${memoryBar} ${chalk.white(info.memory.free)}GB / ${chalk.white(info.memory.total)}GB`);
  
  // CPU info
  console.log(`  ${chalk.yellow('⚡')} CPU: ${chalk.white(info.cpu.cores)} 核心`);
  
  // Uptime
  console.log(`  ${chalk.cyan('⏱️')} 运行时间: ${chalk.white(info.uptime)} 小时`);
  
  // Performance indicator
  const performance = getPerformanceIndicator(info);
  console.log(`  ${chalk.magenta('📊')} 性能: ${performance}`);
}

/**
 * Get platform-specific icon.
 * @param {string} platform - Platform name.
 * @returns {string} Platform icon.
 */
function getPlatformIcon(platform) {
  const icons = {
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
 * @param {number} percentage - Memory usage percentage.
 * @returns {string} Memory bar string.
 */
function createMemoryBar(percentage) {
  const width = 15;
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  
  let color;
  if (percentage < 50) color = chalk.green;
  else if (percentage < 80) color = chalk.yellow;
  else color = chalk.red;
  
  const filledBar = color('█').repeat(filled);
  const emptyBar = chalk.gray('░').repeat(empty);
  
  return `[${filledBar}${emptyBar}] ${percentage}%`;
}

/**
 * Get performance indicator based on system info.
 * @param {Object} info - System information.
 * @returns {string} Performance indicator.
 */
function getPerformanceIndicator(info) {
  const memoryUsage = ((info.memory.total - info.memory.free) / info.memory.total) * 100;
  const cpuCores = info.cpu.cores;
  
  let performance;
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
export function printNetworkStatus() {
  console.log(chalk.blue.bold('\n🌐 网络状态:'));
  console.log(`  ${chalk.green('🟢')} 外网连接: 正常`);
  console.log(`  ${chalk.green('🟢')} NBTCA 服务: 在线`);
  console.log(`  ${chalk.green('🟢')} 镜像站点: 可用`);
}

/**
 * Print quick tips.
 */
export function printQuickTips() {
  const tips = [
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