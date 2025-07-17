# NBTCA Welcome v2.3.0

![Demo](assets/Prompt_demo.gif)

> 为浙大宁波理工学院计算机协会打造的专业欢迎工具

## ✨ 新功能特性

### 🎨 增强的视觉效果
- **多种动画效果**: 彩虹、波浪、脉冲、打字机等动画
- **渐变文字**: 支持多种颜色渐变效果
- **加载动画**: 自定义加载动画和进度条
- **系统信息显示**: 实时显示系统状态和性能

### 🚀 丰富的交互体验
- **分类菜单**: 官方网站、技术支持、学习资源、社区交流等
- **子菜单系统**: 每个分类都有详细的子菜单
- **确认对话框**: 重要操作前的确认提示
- **输入提示**: 支持文本和密码输入

### 📊 系统监控
- **实时系统信息**: CPU、内存、平台信息
- **网络状态**: 连接状态和服务可用性
- **性能指标**: 系统性能评估和建议

### 🔧 技术支持服务
- **电脑维修**: 硬件和软件问题解决
- **网络配置**: 网络连接和配置服务
- **移动设备**: 手机和平板电脑支持
- **服务预约**: 在线预约系统

## 🚀 快速开始

### 安装

```bash
npm install @nbtca/welcome
```

### 使用

```bash
# 推荐方式
npx @nbtca/welcome

# 或本地运行
npm start

# 开发模式（自动重启）
npm run dev
```

## 📁 项目结构

```
.
├── bin/
│   └── nbtca-welcome.js          # CLI 入口点
├── src/
│   ├── index.js                  # 主入口文件
│   ├── main.js                   # 核心应用逻辑
│   ├── logo/                     # ASCII Logo 相关
│   │   ├── printLogo.js
│   │   └── logo.txt             # 终端图像数据
│   ├── gradient/                 # 渐变文字效果
│   │   └── printGradientText.js
│   ├── animation/                # 动画效果
│   │   ├── printLolcatAnimated.js
│   │   └── loadingAnimation.js
│   ├── ui/                       # 用户界面组件
│   │   ├── welcomeBanner.js
│   │   └── systemInfo.js
│   └── menu/                     # 交互菜单
│       ├── showMainMenu.js
│       ├── handleUserAction.js
│       └── subMenu.js
├── assets/
│   └── Prompt_demo.gif          # 演示动画
└── package.json
```

## 🎯 主要功能

### 🌐 官方网站服务
- 🏠 官方网站主页
- 📰 新闻资讯
- 📅 活动日历
- 👥 团队介绍
- 📞 联系我们

### 🔧 技术支持服务
- 💻 电脑硬件维修
- 🔧 软件问题解决
- 🌐 网络配置服务
- 📱 移动设备支持
- 🛠️ 硬件升级咨询
- 📋 服务预约

### 📚 学习资源中心
- 📚 技术文档
- 🎥 视频教程
- 💡 编程学习
- 🎨 设计资源
- 🔬 学术研究
- 📖 推荐书籍

### 👥 社区交流
- 💬 技术交流群
- 📢 官方QQ群
- 🐙 GitHub组织
- 📱 微信公众号
- 🎯 项目合作
- 🏆 竞赛信息

### ⚙️ 系统设置
- 🎨 主题设置
- 🌐 网络配置
- 📊 性能监控
- 🔔 通知设置
- 🔄 检查更新

## 🛠️ 技术栈

- **Node.js** (ES Modules)
- **inquirer** - 交互式命令行界面
- **chalk** - 终端颜色输出
- **isomorphic-lolcat** - 彩虹色动画效果
- **open** - 打开系统默认浏览器
- **boxen** - 创建边框效果

## 🎨 动画效果

### 彩虹动画
```javascript
await printLolcatAnimated('Hello World!', {
  duration: 2000,
  fps: 30,
  effect: 'rainbow'
});
```

### 波浪动画
```javascript
await printLolcatAnimated('Hello World!', {
  effect: 'wave'
});
```

### 脉冲动画
```javascript
await printLolcatAnimated('Hello World!', {
  effect: 'pulse'
});
```

### 打字机效果
```javascript
await printLolcatAnimated('Hello World!', {
  effect: 'typewriter'
});
```

## 📊 系统要求

- **Node.js**: >= 16.0.0
- **操作系统**: Windows, macOS, Linux
- **终端**: 支持 ANSI 转义序列的终端

## 🔧 开发

### 安装依赖
```bash
npm install
```

### 运行开发模式
```bash
npm run dev
```

### 构建
```bash
npm run build
```

## 📝 更新日志

### v2.3.0
- ✨ 新增多种动画效果
- 🎨 增强的渐变文字功能
- 📊 实时系统信息显示
- 🚀 分类菜单系统
- 🔧 丰富的技术支持服务
- 📚 学习资源中心
- 👥 社区交流功能
- ⚙️ 系统设置选项

### v2.2.0
- 🎨 基础动画效果
- 🌐 官方网站访问
- 🔧 维修服务

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📞 联系我们

- 🌐 官网: https://nbtca.space/
- 📧 邮箱: contact@m1ng.space
- 🐙 GitHub: https://github.com/nbtca

---

**NBTCA Welcome** - 让技术更亲近，让学习更高效！ 🚀
