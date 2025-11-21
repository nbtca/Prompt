/**
 * 智能Logo显示模块
 * 尝试显示iTerm2图片格式logo，失败则降级到ASCII艺术字
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import gradient from 'gradient-string';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 创建蓝色主调的渐变效果
 */
function createBlueGradient(text: string): string {
  // 使用蓝色系渐变：深蓝 -> 青色 -> 天蓝
  const blueGradient = gradient([
    { color: '#1e3a8a', pos: 0 },    // 深蓝
    { color: '#0ea5e9', pos: 0.5 },  // 天蓝
    { color: '#06b6d4', pos: 1 }     // 青色
  ]);
  return blueGradient(text);
}

/**
 * 显示渐变动画效果（优化版 - 更丝滑的动画）
 */
async function animateGradient(text: string, duration: number = 1200): Promise<void> {
  const frames = 24; // 增加帧数使动画更流畅
  const frameDelay = duration / frames;

  // 预创建所有渐变对象
  const gradients = [
    gradient('#1e3a8a', '#2563eb', '#3b82f6'),
    gradient('#2563eb', '#3b82f6', '#0ea5e9'),
    gradient('#3b82f6', '#0ea5e9', '#06b6d4'),
    gradient('#0ea5e9', '#06b6d4', '#14b8a6'),
    gradient('#06b6d4', '#14b8a6', '#0ea5e9'),
    gradient('#14b8a6', '#0ea5e9', '#3b82f6'),
    gradient('#0ea5e9', '#3b82f6', '#2563eb'),
    gradient('#3b82f6', '#2563eb', '#1e3a8a'),
  ];

  for (let i = 0; i < frames; i++) {
    const gradientIndex = Math.floor((i / frames) * gradients.length);
    const frameGradient = gradients[gradientIndex]!;

    // 清除当前行并显示新帧
    process.stdout.write('\r' + frameGradient(text));

    await new Promise(resolve => setTimeout(resolve, frameDelay));
  }

  // 最后显示静态的蓝色渐变
  process.stdout.write('\r' + createBlueGradient(text) + '\n');
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
      await printDescription();
      return;
    }
  } catch (error) {
    // iTerm2 logo读取失败，继续尝试ASCII logo
  }

  // 降级：显示ASCII艺术字logo
  try {
    const asciiLogoPath = join(__dirname, '../logo/ascii-logo.txt');
    const asciiContent = readFileSync(asciiLogoPath, 'utf-8');

    // 使用渐变彩色显示ASCII logo
    console.log();
    const lines = asciiContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(createBlueGradient(line));
    });

    await printDescription();
  } catch (error) {
    // 如果ASCII logo也失败，显示简单的文本logo
    console.log();
    console.log(createBlueGradient('  NBTCA'));
    await printDescription();
  }
}

/**
 * 显示描述文字（带渐变动画）
 */
async function printDescription(): Promise<void> {
  const tagline = 'To be at the intersection of technology and liberal arts.';

  console.log();

  // 显示渐变动画
  await animateGradient(tagline, 1500);

  console.log();
}

