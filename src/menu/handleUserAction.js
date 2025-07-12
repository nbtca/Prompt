// Enhanced user action handler with multiple services and features.

import chalk from "chalk";
import open from "open";
import { 
  showOfficialSubMenu, 
  showTechSubMenu, 
  showLearningSubMenu, 
  showCommunitySubMenu, 
  showSettingsSubMenu, 
  showHelpSubMenu 
} from "./subMenu.js";
import { showLoadingAnimation, showTypingAnimation } from "../animation/loadingAnimation.js";
import { printSuccessMessage, printWarningMessage, printErrorMessage } from "../ui/welcomeBanner.js";

/**
 * Enhanced action handler with multiple categories and services.
 * @param {string} action - The selected action.
 */
export async function handleUserAction(action) {
  try {
    switch (action) {
      case "official":
        await showOfficialSubMenu();
        break;
        
      case "tech":
        await showTechSubMenu();
        break;
        
      case "learning":
        await showLearningSubMenu();
        break;
        
      case "community":
        await showCommunitySubMenu();
        break;
        
      case "settings":
        await showSettingsSubMenu();
        break;
        
      case "help":
        await showHelpSubMenu();
        break;
        
      // Legacy actions for backward compatibility
      case "repair":
        await handleRepairService();
        break;
        
      case "mirror":
        await handleMirrorService();
        break;
        
      default:
        printWarningMessage(`未知操作: ${action}`);
        console.log(chalk.yellow("💡 提示: 请从菜单中选择有效选项"));
    }
  } catch (error) {
    printErrorMessage(`处理操作时发生错误: ${error.message}`);
  }
}

/**
 * Handle repair service with enhanced features.
 */
async function handleRepairService() {
  await showLoadingAnimation("正在连接维修服务...", 1500);
  
  const services = [
    { name: "💻 电脑硬件维修", url: "https://nbtca.space/repair/hardware" },
    { name: "🔧 软件问题解决", url: "https://nbtca.space/repair/software" },
    { name: "🌐 网络配置服务", url: "https://nbtca.space/repair/network" },
    { name: "📱 移动设备维修", url: "https://nbtca.space/repair/mobile" }
  ];
  
  console.log(chalk.blue.bold("\n🔧 可用的维修服务:"));
  services.forEach((service, index) => {
    console.log(`  ${index + 1}. ${service.name}`);
  });
  
  printSuccessMessage("正在打开维修服务页面...");
  await open("https://nbtca.space/repair/");
}

/**
 * Handle mirror service with enhanced features.
 */
async function handleMirrorService() {
  await showLoadingAnimation("正在检查镜像站点状态...", 1000);
  
  const mirrors = [
    { name: "主镜像站", url: "https://i.nbtca.space/", status: "🟢 在线" },
    { name: "备用镜像站", url: "https://mirror.nbtca.space/", status: "🟢 在线" },
    { name: "开发镜像站", url: "https://dev.nbtca.space/", status: "🟡 维护中" }
  ];
  
  console.log(chalk.blue.bold("\n🚀 镜像站点状态:"));
  mirrors.forEach(mirror => {
    console.log(`  ${mirror.name}: ${mirror.status}`);
  });
  
  printSuccessMessage("正在打开主镜像站点...");
  await open("https://i.nbtca.space/");
}

/**
 * Handle official website services.
 */
async function handleOfficialServices() {
  const services = {
    homepage: "https://nbtca.space/",
    news: "https://nbtca.space/news/",
    events: "https://nbtca.space/events/",
    team: "https://nbtca.space/team/",
    contact: "https://nbtca.space/contact/"
  };
  
  for (const [service, url] of Object.entries(services)) {
    await showLoadingAnimation(`正在打开 ${service}...`, 500);
    await open(url);
  }
}

/**
 * Handle technical support services.
 */
async function handleTechServices() {
  const services = {
    repair: "https://nbtca.space/repair/",
    software: "https://nbtca.space/software/",
    network: "https://nbtca.space/network/",
    mobile: "https://nbtca.space/mobile/",
    hardware: "https://nbtca.space/hardware/",
    booking: "https://nbtca.space/booking/"
  };
  
  for (const [service, url] of Object.entries(services)) {
    await showLoadingAnimation(`正在处理 ${service} 请求...`, 500);
    await open(url);
  }
}

/**
 * Handle learning resources.
 */
async function handleLearningResources() {
  const resources = {
    docs: "https://docs.nbtca.space/",
    videos: "https://nbtca.space/videos/",
    programming: "https://nbtca.space/programming/",
    design: "https://nbtca.space/design/",
    research: "https://nbtca.space/research/",
    books: "https://nbtca.space/books/"
  };
  
  for (const [resource, url] of Object.entries(resources)) {
    await showLoadingAnimation(`正在加载 ${resource} 资源...`, 500);
    await open(url);
  }
}

/**
 * Handle community services.
 */
async function handleCommunityServices() {
  const communities = {
    chat: "https://chat.nbtca.space/",
    qq: "https://qm.qq.com/",
    github: "https://github.com/nbtca",
    wechat: "https://nbtca.space/wechat/",
    projects: "https://nbtca.space/projects/",
    competitions: "https://nbtca.space/competitions/"
  };
  
  for (const [community, url] of Object.entries(communities)) {
    await showLoadingAnimation(`正在连接 ${community} 社区...`, 500);
    await open(url);
  }
}

/**
 * Handle system settings.
 */
async function handleSystemSettings() {
  console.log(chalk.cyan.bold("\n⚙️ 系统设置选项:"));
  console.log("  🎨 主题设置 - 自定义界面外观");
  console.log("  🌐 网络配置 - 配置网络连接");
  console.log("  📊 性能监控 - 查看系统性能");
  console.log("  🔔 通知设置 - 管理通知偏好");
  console.log("  🔄 检查更新 - 获取最新版本");
  
  printSuccessMessage("设置功能正在开发中...");
}

/**
 * Handle help and about.
 */
async function handleHelpAndAbout() {
  console.log(chalk.gray.bold("\n❓ 帮助与关于:"));
  console.log("  📖 使用帮助 - 详细使用说明");
  console.log("  ❓ 常见问题 - 常见问题解答");
  console.log("  🐛 问题反馈 - 报告问题或建议");
  console.log("  📄 用户协议 - 使用条款");
  console.log("  🔒 隐私政策 - 隐私保护说明");
  console.log("  ℹ️ 关于我们 - 团队信息");
  
  await showTypingAnimation("NBTCA Welcome v2.3.0 - 为浙大宁波理工学院计算机协会打造的专业欢迎工具");
}
