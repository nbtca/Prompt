// colorGradient.js
export const archBlue = [23, 147, 209];
export const white = [255, 255, 255];

function rgbToAnsi(r, g, b) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function lerpColor(color1, color2, t) {
  return color1.map((c, i) => Math.round(c + (color2[i] - c) * t));
}

/**
 * 打印文本蓝白渐变（水平渐变）
 * @param {string} text 要打印的文本
 * @param {Array} startColor 起始颜色 [r,g,b]
 * @param {Array} endColor 结束颜色 [r,g,b]
 */
export function printGradientText(
  text,
  startColor = archBlue,
  endColor = white,
) {
  const chars = [...text];
  const len = chars.length;

  let output = "";
  for (let i = 0; i < len; i++) {
    const t = len === 1 ? 0 : i / (len - 1);
    const [r, g, b] = lerpColor(startColor, endColor, t);
    output += rgbToAnsi(r, g, b) + chars[i];
  }
  output += "\x1b[0m";
  process.stdout.write(output + "\n");
}
