// printLogo.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取并打印 logo（无渐变）
export function printLogo() {
  const logoPath = path.resolve(__dirname, "../logo/logo.txt");

  try {
    const data = fs.readFileSync(logoPath, "utf8");
    console.log(data.trim());
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error("错误：logo.txt 文件不存在，请确保文件位于正确的路径！");
    } else {
      console.error("读取 logo.txt 时出错:", err.message);
    }
  }
}
