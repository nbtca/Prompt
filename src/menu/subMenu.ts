// Sub-menu handlers for different categories with full implementations.

import chalk from "chalk";
import open from "open";
import { showCategoryMenu, showConfirmation } from "./showMainMenu.js";
import { printSuccessMessage, printWarningMessage, printErrorMessage } from "../ui/welcomeBanner.js";
import { showLoadingAnimation, showTypingAnimation } from "../animation/loadingAnimation.js";
import type {
  MenuChoice,
  OfficialAction,
  TechAction,
  LearningAction,
  CommunityAction,
  SettingsAction,
  HelpAction,
  ServiceWithUrl,
  TechService
} from "../types.js";

/**
 * Show official website services sub-menu.
 */
export async function showOfficialSubMenu(): Promise<void> {
  const choices: MenuChoice[] = [
    { name: "🏠 官方网站主页", value: "homepage" },
    { name: "📰 新闻资讯", value: "news" },
    { name: "📅 活动日历", value: "events" },
    { name: "👥 团队介绍", value: "team" },
    { name: "📞 联系我们", value: "contact" },
    { name: "🔙 返回主菜单", value: "back" }
  ];

  const action = await showCategoryMenu("官方网站服务", choices) as OfficialAction;

  if (action === "back") {
    return;
  }

  await handleOfficialAction(action);
}

/**
 * Show technical support services sub-menu.
 */
export async function showTechSubMenu(): Promise<void> {
  const choices: MenuChoice[] = [
    { name: "🔧 电脑维修服务", value: "repair" },
    { name: "💻 软件安装", value: "software" },
    { name: "🌐 网络配置", value: "network" },
    { name: "📱 移动设备支持", value: "mobile" },
    { name: "🛠️ 硬件升级咨询", value: "hardware" },
    { name: "📋 服务预约", value: "booking" },
    { name: "🔙 返回主菜单", value: "back" }
  ];

  const action = await showCategoryMenu("技术支持服务", choices) as TechAction;

  if (action === "back") {
    return;
  }

  await handleTechAction(action);
}

/**
 * Show learning resources sub-menu.
 */
export async function showLearningSubMenu(): Promise<void> {
  const choices: MenuChoice[] = [
    { name: "📚 技术文档", value: "docs" },
    { name: "🎥 视频教程", value: "videos" },
    { name: "💡 编程学习", value: "coding" },
    { name: "🎨 设计资源", value: "design" },
    { name: "🔬 学术研究", value: "research" },
    { name: "📖 推荐书籍", value: "books" },
    { name: "🔙 返回主菜单", value: "back" }
  ];

  const action = await showCategoryMenu("学习资源中心", choices) as LearningAction;

  if (action === "back") {
    return;
  }

  await handleLearningAction(action);
}

/**
 * Show community sub-menu.
 */
export async function showCommunitySubMenu(): Promise<void> {
  const choices: MenuChoice[] = [
    { name: "💬 技术交流群", value: "forum" },
    { name: "📢 官方QQ群", value: "qq" },
    { name: "🐙 GitHub组织", value: "github" },
    { name: "📱 微信公众号", value: "wechat" },
    { name: "🎯 项目合作", value: "projects" },
    { name: "🏆 竞赛信息", value: "contests" },
    { name: "🔙 返回主菜单", value: "back" }
  ];

  const action = await showCategoryMenu("社区交流", choices) as CommunityAction;

  if (action === "back") {
    return;
  }

  await handleCommunityAction(action);
}

/**
 * Show settings sub-menu.
 */
export async function showSettingsSubMenu(): Promise<void> {
  const choices: MenuChoice[] = [
    { name: "🎨 主题设置", value: "theme" },
    { name: "🌐 网络配置", value: "network" },
    { name: "📊 性能监控", value: "performance" },
    { name: "🔔 通知设置", value: "notifications" },
    { name: "🔄 检查更新", value: "updates" },
    { name: "🔙 返回主菜单", value: "back" }
  ];

  const action = await showCategoryMenu("系统设置", choices) as SettingsAction;

  if (action === "back") {
    return;
  }

  await handleSettingsAction(action);
}

/**
 * Show help and about sub-menu.
 */
export async function showHelpSubMenu(): Promise<void> {
  const choices: MenuChoice[] = [
    { name: "❓ 使用帮助", value: "guide" },
    { name: "📋 常见问题", value: "faq" },
    { name: "🐛 问题反馈", value: "feedback" },
    { name: "📄 用户协议", value: "terms" },
    { name: "🔒 隐私政策", value: "privacy" },
    { name: "ℹ️ 关于我们", value: "about" },
    { name: "🔙 返回主菜单", value: "back" }
  ];

  const action = await showCategoryMenu("帮助与关于", choices) as HelpAction;

  if (action === "back") {
    return;
  }

  await handleHelpAction(action);
}

// Handler functions for different sub-menus with full implementations

/**
 * Handle official website actions with virtual data.
 */
async function handleOfficialAction(action: OfficialAction): Promise<void> {
  const officialData: Record<OfficialAction, ServiceWithUrl | undefined> = {
    homepage: {
      url: "https://nbtca.space/",
      title: "NBTCA 官方网站",
      description: "浙大宁波理工学院计算机协会官方网站"
    },
    news: {
      url: "https://nbtca.space/news/",
      title: "新闻资讯",
      description: "最新技术资讯和协会动态"
    },
    events: {
      url: "https://nbtca.space/events/",
      title: "活动日历",
      description: "技术讲座、竞赛、培训等活动安排"
    },
    team: {
      url: "https://nbtca.space/team/",
      title: "团队介绍",
      description: "核心成员和技术团队介绍"
    },
    contact: {
      url: "https://nbtca.space/contact/",
      title: "联系我们",
      description: "联系方式和服务时间"
    },
    back: undefined
  };

  const data = officialData[action];
  if (!data) {
    printErrorMessage("未知的官方网站服务");
    return;
  }

  await showLoadingAnimation(`正在打开 ${data.title}...`, 1000);
  printSuccessMessage(`${data.title}: ${data.description}`);

  try {
    await open(data.url);
  } catch (error) {
    printWarningMessage(`无法打开浏览器，请手动访问: ${data.url}`);
  }
}

/**
 * Handle technical support actions with virtual data.
 */
async function handleTechAction(action: TechAction): Promise<void> {
  const techData: Record<TechAction, (TechService & { url?: string }) | undefined> = {
    repair: {
      title: "电脑维修服务",
      description: "硬件故障诊断、软件问题解决、系统优化",
      services: [
        "💻 硬件故障诊断",
        "🔧 软件问题解决",
        "⚡ 系统性能优化",
        "🛡️ 病毒清理",
        "💾 数据恢复"
      ],
      contact: "维修热线: 0574-12345678",
      location: "维修地点: 图书馆一楼技术服务中心",
      hours: "9:00-17:00",
      price: "50-200元"
    },
    software: {
      title: "软件安装服务",
      description: "正版软件安装、配置优化、使用培训",
      services: [
        "📱 操作系统安装",
        "🖥️ 办公软件安装",
        "🎨 设计软件安装",
        "💻 开发环境配置",
        "🔧 软件使用培训"
      ],
      contact: "软件服务: 0574-12345679",
      location: "服务地点: 计算机学院实验室",
      hours: "9:00-17:00",
      price: "30-100元"
    },
    network: {
      title: "网络配置服务",
      description: "网络连接配置、WiFi设置、网络故障排除",
      services: [
        "🌐 网络连接配置",
        "📶 WiFi设置优化",
        "🔧 网络故障排除",
        "🛡️ 网络安全配置",
        "📱 移动设备网络"
      ],
      contact: "网络服务: 0574-12345680",
      location: "服务地点: 网络中心",
      hours: "9:00-17:00",
      price: "免费"
    },
    mobile: {
      title: "移动设备支持",
      description: "手机、平板电脑维修和软件安装",
      services: [
        "📱 手机维修服务",
        "📱 平板电脑维修",
        "📱 移动软件安装",
        "📱 数据迁移服务",
        "📱 设备优化"
      ],
      contact: "移动设备服务: 0574-12345681",
      location: "服务地点: 移动设备维修中心",
      hours: "9:00-17:00",
      price: "50-300元"
    },
    hardware: {
      title: "硬件升级咨询",
      description: "硬件升级建议、配件推荐、性能提升方案",
      services: [
        "💾 内存升级建议",
        "💿 硬盘升级方案",
        "🎮 显卡升级咨询",
        "🔋 电池更换服务",
        "🖥️ 显示器升级"
      ],
      contact: "硬件咨询: 0574-12345682",
      location: "咨询地点: 硬件服务中心",
      hours: "9:00-17:00",
      price: "免费咨询"
    },
    booking: {
      title: "服务预约系统",
      description: "在线预约维修服务，实时查看服务状态",
      url: "https://nbtca.space/booking/",
      services: [
        "📅 在线预约服务",
        "⏰ 实时服务状态",
        "📱 短信通知提醒",
        "⭐ 服务评价系统",
        "📊 服务记录查询"
      ],
      contact: "预约热线: 0574-12345683",
      location: "在线预约系统",
      hours: "24小时",
      price: "免费"
    },
    back: undefined
  };

  const data = techData[action];
  if (!data) {
    printErrorMessage("未知的技术支持服务");
    return;
  }

  await showLoadingAnimation(`正在处理 ${data.title} 请求...`, 1500);

  console.log(chalk.blue.bold(`\n🔧 ${data.title}`));
  console.log(chalk.gray(`${data.description}\n`));

  if (data.services) {
    console.log(chalk.cyan.bold("📋 服务项目:"));
    data.services.forEach(service => {
      console.log(`  ${service}`);
    });
    console.log(`\n📞 ${data.contact}`);
    console.log(`📍 ${data.location}\n`);
  }

  if (data.url) {
    printSuccessMessage(`正在打开预约系统...`);
    try {
      await open(data.url);
    } catch (error) {
      printWarningMessage(`无法打开浏览器，请手动访问: ${data.url}`);
    }
  }
}

/**
 * Handle learning resource actions with virtual data.
 */
async function handleLearningAction(action: LearningAction): Promise<void> {
  interface LearningResourceData extends ServiceWithUrl {
    resources?: string[];
    topics?: string[];
  }

  const learningData: Record<LearningAction, LearningResourceData | undefined> = {
    docs: {
      title: "技术文档中心",
      description: "全面的技术文档和教程",
      url: "https://docs.nbtca.space/",
      categories: [
        "📚 编程语言文档",
        "🖥️ 操作系统教程",
        "🌐 网络技术文档",
        "🔧 开发工具指南",
        "📱 移动开发教程"
      ]
    },
    videos: {
      title: "视频教程库",
      description: "高质量的技术视频教程",
      url: "https://nbtca.space/videos/",
      categories: [
        "🎥 编程入门教程",
        "🎥 高级技术讲座",
        "🎥 项目实战演示",
        "🎥 技术分享会",
        "🎥 竞赛培训视频"
      ]
    },
    coding: {
      title: "编程学习平台",
      description: "在线编程练习和项目实战",
      url: "https://code.nbtca.space/",
      features: [
        "💻 在线编程环境",
        "🎯 编程练习题",
        "🚀 项目实战训练",
        "👥 代码审查服务",
        "🏆 编程竞赛平台"
      ]
    },
    design: {
      title: "设计资源库",
      description: "UI/UX设计资源和工具",
      url: "https://design.nbtca.space/",
      resources: [
        "🎨 UI设计模板",
        "🎨 图标和插画",
        "🎨 设计工具教程",
        "🎨 设计规范文档",
        "🎨 设计灵感库"
      ]
    },
    research: {
      title: "学术研究资源",
      description: "计算机科学学术研究资料",
      url: "https://research.nbtca.space/",
      topics: [
        "🔬 人工智能研究",
        "🔬 机器学习论文",
        "🔬 数据科学应用",
        "🔬 网络安全研究",
        "🔬 软件工程实践"
      ]
    },
    books: {
      title: "推荐书籍清单",
      description: "精选技术书籍和学习资料",
      url: "https://books.nbtca.space/",
      categories: [
        "📖 编程语言书籍",
        "📖 算法与数据结构",
        "📖 系统设计书籍",
        "📖 技术管理书籍",
        "📖 计算机科学经典"
      ]
    },
    back: undefined
  };

  const data = learningData[action];
  if (!data) {
    printErrorMessage("未知的学习资源");
    return;
  }

  await showLoadingAnimation(`正在加载 ${data.title}...`, 1000);

  console.log(chalk.yellow.bold(`\n📚 ${data.title}`));
  console.log(chalk.gray(`${data.description}\n`));

  if (data.categories) {
    console.log(chalk.cyan.bold("📂 资源分类:"));
    for (const category of data.categories) {
      console.log(`  ${category}`);
    }
  } else if (data.features) {
    console.log(chalk.cyan.bold("✨ 平台功能:"));
    for (const feature of data.features) {
      console.log(`  ${feature}`);
    }
  } else if (data.resources) {
    console.log(chalk.cyan.bold("🎨 设计资源:"));
    for (const resource of data.resources) {
      console.log(`  ${resource}`);
    }
  } else if (data.topics) {
    console.log(chalk.cyan.bold("🔬 研究主题:"));
    for (const topic of data.topics) {
      console.log(`  ${topic}`);
    }
  }

  console.log(`\n🌐 访问地址: ${data.url}`);

  const confirmed = await showConfirmation("是否立即打开该资源？");
  if (confirmed) {
    try {
      await open(data.url);
    } catch (error) {
      printWarningMessage(`无法打开浏览器，请手动访问: ${data.url}`);
    }
  }
}

/**
 * Handle community actions with virtual data.
 */
async function handleCommunityAction(action: CommunityAction): Promise<void> {
  interface CommunityResourceData {
    title: string;
    description: string;
    url?: string;
    features?: string[];
    groups?: Array<{ name: string; number: string; members: string }>;
    projects?: string[];
    account?: string;
    categories?: string[];
    events?: string[];
  }

  const communityData: Record<CommunityAction, CommunityResourceData | undefined> = {
    forum: {
      title: "技术交流群",
      description: "实时技术讨论和交流平台",
      url: "https://chat.nbtca.space/",
      features: [
        "💬 实时技术讨论",
        "👥 专家在线答疑",
        "📱 移动端支持",
        "🔔 消息通知",
        "📊 讨论记录"
      ]
    },
    qq: {
      title: "官方QQ群",
      description: "NBTCA官方QQ交流群",
      groups: [
        { name: "NBTCA技术交流群", number: "123456789", members: "500+" },
        { name: "NBTCA竞赛群", number: "987654321", members: "300+" },
        { name: "NBTCA学习群", number: "456789123", members: "400+" }
      ]
    },
    github: {
      title: "GitHub组织",
      description: "开源项目和技术分享",
      url: "https://github.com/nbtca",
      projects: [
        "📦 nbtca-welcome - 欢迎工具",
        "🌐 nbtca-website - 官方网站",
        "📚 nbtca-docs - 技术文档",
        "🎨 nbtca-design - 设计资源",
        "🔧 nbtca-tools - 开发工具"
      ]
    },
    wechat: {
      title: "微信公众号",
      description: "NBTCA官方微信公众号",
      account: "NBTCA计算机协会",
      features: [
        "📰 技术资讯推送",
        "🎯 活动通知",
        "💡 技术分享",
        "📱 移动端阅读",
        "🔗 资源链接"
      ]
    },
    projects: {
      title: "项目合作",
      description: "技术项目合作和团队组建",
      url: "https://projects.nbtca.space/",
      categories: [
        "🤝 开源项目合作",
        "🎯 竞赛项目组队",
        "💼 企业项目对接",
        "🎓 学术研究合作",
        "🚀 创新项目孵化"
      ]
    },
    contests: {
      title: "竞赛信息",
      description: "各类技术竞赛和比赛信息",
      url: "https://competitions.nbtca.space/",
      events: [
        "🏆 ACM程序设计竞赛",
        "🏆 蓝桥杯编程大赛",
        "🏆 数学建模竞赛",
        "🏆 创新创业大赛",
        "🏆 网络安全竞赛"
      ]
    },
    back: undefined
  };

  const data = communityData[action];
  if (!data) {
    printErrorMessage("未知的社区服务");
    return;
  }

  await showLoadingAnimation(`正在连接 ${data.title}...`, 1000);

  console.log(chalk.magenta.bold(`\n👥 ${data.title}`));
  console.log(chalk.gray(`${data.description}\n`));

  if (data.features) {
    console.log(chalk.cyan.bold("✨ 功能特色:"));
    for (const feature of data.features) {
      console.log(`  ${feature}`);
    }
  } else if (data.groups) {
    console.log(chalk.cyan.bold("📢 QQ群信息:"));
    for (const group of data.groups) {
      console.log(`  ${group.name}: ${group.number} (${group.members})`);
    }
  } else if (data.projects) {
    console.log(chalk.cyan.bold("🐙 开源项目:"));
    for (const project of data.projects) {
      console.log(`  ${project}`);
    }
  } else if (data.account) {
    console.log(chalk.cyan.bold("📱 微信公众号:"));
    console.log(`  账号: ${data.account}`);
  } else if (data.categories) {
    console.log(chalk.cyan.bold("🤝 合作类型:"));
    for (const category of data.categories) {
      console.log(`  ${category}`);
    }
  } else if (data.events) {
    console.log(chalk.cyan.bold("🏆 竞赛活动:"));
    for (const event of data.events) {
      console.log(`  ${event}`);
    }
  }

  if (data.url) {
    console.log(`\n🌐 访问地址: ${data.url}`);
    const confirmed = await showConfirmation("是否立即访问？");
    if (confirmed) {
      try {
        await open(data.url);
      } catch (error) {
        printWarningMessage(`无法打开浏览器，请手动访问: ${data.url}`);
      }
    }
  }
}

/**
 * Handle settings actions with virtual data.
 */
async function handleSettingsAction(action: SettingsAction): Promise<void> {
  interface SettingsData {
    title: string;
    description: string;
    themes?: Array<{ name: string; value: string; description: string }>;
    options?: string[];
    metrics?: string[];
    currentVersion?: string;
    latestVersion?: string;
    status?: string;
  }

  const settingsData: Record<SettingsAction, SettingsData | undefined> = {
    theme: {
      title: "主题设置",
      description: "自定义界面外观和颜色主题",
      themes: [
        { name: "默认主题", value: "default", description: "经典蓝白配色" },
        { name: "深色主题", value: "dark", description: "护眼深色模式" },
        { name: "浅色主题", value: "light", description: "清新浅色模式" },
        { name: "NBTCA主题", value: "nbtca", description: "协会专属主题" }
      ]
    },
    network: {
      title: "网络配置",
      description: "网络连接设置和代理配置",
      options: [
        "🌐 网络连接测试",
        "🔧 代理服务器设置",
        "📶 WiFi配置优化",
        "🛡️ 网络安全设置",
        "📊 网络性能监控"
      ]
    },
    performance: {
      title: "性能监控",
      description: "系统性能监控和优化建议",
      metrics: [
        "💾 内存使用率: 75%",
        "⚡ CPU使用率: 45%",
        "🌐 网络延迟: 15ms",
        "💿 磁盘使用率: 60%",
        "🔋 电池状态: 充电中"
      ]
    },
    notifications: {
      title: "通知设置",
      description: "消息通知和提醒设置",
      options: [
        "🔔 系统通知",
        "📱 消息推送",
        "⏰ 定时提醒",
        "🎯 重要事件提醒",
        "📧 邮件通知"
      ]
    },
    updates: {
      title: "检查更新",
      description: "检查软件更新和版本信息",
      currentVersion: "v2.3.0",
      latestVersion: "v2.3.0",
      status: "已是最新版本"
    },
    back: undefined
  };

  const data = settingsData[action];
  if (!data) {
    printErrorMessage("未知的设置选项");
    return;
  }

  await showLoadingAnimation(`正在加载 ${data.title}...`, 800);

  console.log(chalk.cyan.bold(`\n⚙️ ${data.title}`));
  console.log(chalk.gray(`${data.description}\n`));

  if (data.themes) {
    console.log(chalk.cyan.bold("🎨 可用主题:"));
    data.themes.forEach(theme => {
      console.log(`  ${theme.name}: ${theme.description}`);
    });
  } else if (data.options) {
    console.log(chalk.cyan.bold("🔧 配置选项:"));
    data.options.forEach(option => {
      console.log(`  ${option}`);
    });
  } else if (data.metrics) {
    console.log(chalk.cyan.bold("📊 性能指标:"));
    data.metrics.forEach(metric => {
      console.log(`  ${metric}`);
    });
  } else if (data.currentVersion) {
    console.log(chalk.cyan.bold("📦 版本信息:"));
    console.log(`  当前版本: ${data.currentVersion}`);
    console.log(`  最新版本: ${data.latestVersion}`);
    console.log(`  更新状态: ${data.status}`);
  }

  printSuccessMessage("设置功能正在开发中，敬请期待！");
}

/**
 * Handle help actions with virtual data.
 */
async function handleHelpAction(action: HelpAction): Promise<void> {
  interface HelpData {
    title: string;
    description: string;
    sections?: string[];
    questions?: string[];
    channels?: string[];
    url?: string;
    info?: string[];
  }

  const helpData: Record<HelpAction, HelpData | undefined> = {
    guide: {
      title: "使用帮助",
      description: "NBTCA Welcome 使用指南",
      sections: [
        "📖 快速开始指南",
        "🎯 功能介绍",
        "⌨️ 快捷键说明",
        "🔧 常见问题解决",
        "📞 技术支持"
      ]
    },
    faq: {
      title: "常见问题",
      description: "用户常见问题解答",
      questions: [
        "❓ 如何获取技术支持？",
        "❓ 如何加入技术交流群？",
        "❓ 如何参与竞赛活动？",
        "❓ 如何访问学习资源？",
        "❓ 如何联系协会成员？"
      ]
    },
    feedback: {
      title: "问题反馈",
      description: "报告问题或提出建议",
      channels: [
        "📧 邮箱反馈: feedback@nbtca.space",
        "🐙 GitHub Issues",
        "💬 QQ群反馈",
        "📱 微信反馈",
        "🌐 官网反馈"
      ]
    },
    terms: {
      title: "用户协议",
      description: "NBTCA Welcome 使用条款",
      url: "https://nbtca.space/terms/"
    },
    privacy: {
      title: "隐私政策",
      description: "用户隐私保护说明",
      url: "https://nbtca.space/privacy/"
    },
    about: {
      title: "关于我们",
      description: "NBTCA 团队信息",
      info: [
        "🎓 浙大宁波理工学院计算机协会",
        "📍 地址: 浙江省宁波市鄞州区",
        "📧 邮箱: contact@nbtca.space",
        "🌐 官网: https://nbtca.space",
        "🐙 GitHub: https://github.com/nbtca"
      ]
    },
    back: undefined
  };

  const data = helpData[action];
  if (!data) {
    printErrorMessage("未知的帮助选项");
    return;
  }

  await showLoadingAnimation(`正在加载 ${data.title}...`, 600);

  console.log(chalk.gray.bold(`\n❓ ${data.title}`));
  console.log(chalk.gray(`${data.description}\n`));

  if (data.sections) {
    console.log(chalk.cyan.bold("📖 帮助章节:"));
    data.sections.forEach(section => {
      console.log(`  ${section}`);
    });
  } else if (data.questions) {
    console.log(chalk.cyan.bold("❓ 常见问题:"));
    data.questions.forEach(question => {
      console.log(`  ${question}`);
    });
  } else if (data.channels) {
    console.log(chalk.cyan.bold("📞 反馈渠道:"));
    data.channels.forEach(channel => {
      console.log(`  ${channel}`);
    });
  } else if (data.url) {
    console.log(`🌐 访问地址: ${data.url}`);
    const confirmed = await showConfirmation("是否立即查看？");
    if (confirmed) {
      try {
        await open(data.url);
      } catch (error) {
        printWarningMessage(`无法打开浏览器，请手动访问: ${data.url}`);
      }
    }
  } else if (data.info) {
    console.log(chalk.cyan.bold("ℹ️ 协会信息:"));
    data.info.forEach(info => {
      console.log(`  ${info}`);
    });
  }

  await showTypingAnimation("NBTCA Welcome v2.3.0 - 为浙大宁波理工学院计算机协会打造的专业欢迎工具");
}
