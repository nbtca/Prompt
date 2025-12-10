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
 * 将十六进制颜色转换为RGB
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1]!, 16), parseInt(result[2]!, 16), parseInt(result[3]!, 16)]
    : [0, 0, 0];
}

/**
 * 将RGB转换为十六进制颜色
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * 在两个颜色之间进行线性插值
 */
function interpolateColor(color1: string, color2: string, factor: number): string {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);

  const r = r1 + (r2 - r1) * factor;
  const g = g1 + (g2 - g1) * factor;
  const b = b1 + (b2 - b1) * factor;

  return rgbToHex(r, g, b);
}

/**
 * 缓动函数 - 平滑的进出效果
 */
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * 显示渐变动画效果（优化版 - 真正丝滑的动画）
 */
async function animateGradient(text: string, duration: number = 1200): Promise<void> {
  const frames = 60; // 60帧实现真正的流畅动画
  const frameDelay = duration / frames;

  // 定义颜色序列 - 形成完整的蓝色系循环
  const colorSequence = [
    '#1e3a8a', // 深蓝
    '#2563eb', // 蓝
    '#3b82f6', // 亮蓝
    '#0ea5e9', // 天蓝
    '#06b6d4', // 青色
    '#14b8a6', // 青绿
    '#06b6d4', // 青色
    '#0ea5e9', // 天蓝
    '#3b82f6', // 亮蓝
    '#2563eb', // 蓝
    '#1e3a8a', // 深蓝
  ];

  for (let i = 0; i < frames; i++) {
    // 使用平滑的正弦缓动
    const progress = easeInOutSine(i / frames);

    // 计算在颜色序列中的位置
    const position = progress * (colorSequence.length - 1);
    const index1 = Math.floor(position);
    const index2 = Math.min(index1 + 1, colorSequence.length - 1);
    const localProgress = position - index1;

    // 在相邻颜色间插值，生成三个平滑过渡的颜色
    const color1 = interpolateColor(
      colorSequence[index1]!,
      colorSequence[index2]!,
      localProgress
    );

    const nextIndex1 = Math.min(index2, colorSequence.length - 1);
    const nextIndex2 = Math.min(nextIndex1 + 1, colorSequence.length - 1);
    const color2 = interpolateColor(
      colorSequence[nextIndex1]!,
      colorSequence[nextIndex2]!,
      localProgress
    );

    const nextIndex3 = Math.min(nextIndex2, colorSequence.length - 1);
    const nextIndex4 = Math.min(nextIndex3 + 1, colorSequence.length - 1);
    const color3 = interpolateColor(
      colorSequence[nextIndex3]!,
      colorSequence[nextIndex4]!,
      localProgress
    );

    // 为当前帧创建渐变
    const frameGradient = gradient(color1, color2, color3);

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

