/**
 * 智能Logo显示模块
 * 尝试显示iTerm2图片格式logo，失败则降级到ASCII艺术字
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 计算字符串的实际显示宽度（考虑中文字符）
 */
function getDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    // 中文字符、全角符号等占2个宽度
    width += char.charCodeAt(0) > 127 ? 2 : 1;
  }
  return width;
}

/**
 * 尝试读取并显示logo文件
 */
export async function printLogo(): Promise<void> {
  try {
    // 尝试读取iTerm2图片格式logo
    const logoPath = join(__dirname, '../logo/logo.txt');
    const logoContent = readFileSync(logoPath, 'utf-8');

    // 如果成功读取且内容有效，直接显示
    if (logoContent && logoContent.length > 100) {
      console.log(logoContent);
      printDescription();
      return;
    }
  } catch (error) {
    // iTerm2 logo读取失败，继续尝试ASCII logo
  }

  // 降级：显示ASCII艺术字logo
  try {
    const asciiLogoPath = join(__dirname, '../logo/ascii-logo.txt');
    const asciiContent = readFileSync(asciiLogoPath, 'utf-8');

    // 使用cyan颜色显示ASCII logo，不居中（ASCII艺术本身已经设计好）
    console.log();
    const lines = asciiContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(chalk.cyan(line));
    });

    printDescription();
  } catch (error) {
    // 如果ASCII logo也失败，显示简单的文本logo
    console.log(chalk.cyan.bold('\n  NBTCA'));
    printDescription();
  }
}

/**
 * 显示描述文字
 */
function printDescription(): void {
  const description = '浙大宁波理工学院计算机协会';
  const terminalWidth = process.stdout.columns || 80;

  // 计算实际显示宽度
  const displayWidth = getDisplayWidth(description);
  const padding = Math.max(0, Math.floor((terminalWidth - displayWidth) / 2));

  console.log();
  console.log(' '.repeat(padding) + chalk.gray(description));
  console.log();
}

