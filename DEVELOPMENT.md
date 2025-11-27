# 开发指南

## 🚀 快速开始

### 安装依赖

```bash
pnpm install
```

## 🧪 本地测试方法

### ✅ 方法 1: 快速测试（推荐）

```bash
pnpm run dev
```

- ✅ 直接运行 TypeScript 源码
- ✅ 不会自动重启
- ✅ 适合交互式 CLI 测试
- ✅ 程序退出后命令才结束
- ✅ 可以正常使用 Ctrl+C 退出

**使用场景**: 日常开发和功能测试

### 📦 方法 2: 生产环境测试

```bash
# 步骤 1: 构建
pnpm run build

# 步骤 2: 运行
pnpm start
```

- ✅ 测试编译后的代码
- ✅ 最接近生产环境
- ⚠️ 修改代码后需要重新构建

**使用场景**: 发布前最终测试

### 🔗 方法 3: 全局命令测试

```bash
# 步骤 1: 构建并链接到全局
pnpm run build
npm link

# 步骤 2: 在任何目录测试
nbtca

# 步骤 3: 测试完成后清理
npm unlink -g @nbtca/prompt
```

**使用场景**: 测试全局安装体验

### ⚠️ 方法 4: 监听模式（不推荐用于交互式测试）

```bash
pnpm run dev:watch
```

- ⚠️ 文件变化时自动重启
- ❌ 不适合交互式 CLI 测试
- ❌ 会频繁中断交互
- ✅ 仅适合纯函数/工具类开发

**使用场景**: 仅用于调试非交互式代码

## 🎯 测试新功能（知识库模块）

### 测试步骤

1. **启动程序**
   ```bash
   pnpm run dev
   ```

2. **选择 "知识库" 选项**
   - 使用方向键或 Vim 键位 (j/k) 导航
   - 按 Enter 确认

3. **浏览文档分类**
   - 📚 教程 (Tutorial)
   - 🔧 维修日
   - 🎉 相关活动举办
   - 📋 流程文档 (Process)
   - 🛠️ 维修相关 (Repair)
   - 📦 归档文档 (Archived)
   - 📖 README

4. **测试功能点**
   - [ ] 进入目录
   - [ ] 返回上级目录
   - [ ] 查看 Markdown 文件
   - [ ] 终端渲染是否正常
   - [ ] 在浏览器中打开
   - [ ] 网络错误处理

### 预期行为

✅ **正常流程**:
1. 从 GitHub 获取文档列表
2. 显示目录树
3. 选择文件后在终端渲染 Markdown
4. 提供返回或浏览器打开选项

✅ **错误处理**:
1. GitHub API 失败时提示重试
2. 文件加载失败时建议浏览器打开
3. 网络超时友好提示

## 🔧 常见问题

### Q1: 为什么 `pnpm run dev` 比 `pnpm run dev:watch` 好？

**A**: 对于交互式 CLI 应用:

- `pnpm run dev` (tsx src/index.ts)
  - ✅ 运行一次，等待程序退出
  - ✅ 用户可以正常交互
  - ✅ Ctrl+C 正常工作

- `pnpm run dev:watch` (tsx watch src/index.ts)
  - ❌ 监听文件变化，自动重启
  - ❌ 用户操作会被中断
  - ❌ Ctrl+C 只能退出 tsx，不能优雅退出程序

### Q2: 如何退出正在运行的程序？

**A**:
- **正常退出**: 在菜单中选择 "退出" 选项
- **强制退出**: 按 `Ctrl+C`
- 如果卡住: 按 `Ctrl+C` 两次

### Q3: 修改代码后看不到变化？

**A**: 取决于你的测试方法:
- `pnpm run dev`: 重新运行命令即可
- `pnpm start`: 需要先 `pnpm run build`
- `npm link`: 需要 `pnpm run build` 后重新测试

### Q4: TypeScript 编译错误怎么办？

**A**:
```bash
# 检查类型错误
pnpm run build

# 如果有错误，根据提示修复
# 常见错误:
# - 导入路径缺少 .js 后缀
# - 类型定义不匹配
# - 未使用的变量
```

## 📝 开发工作流

### 日常开发

```bash
# 1. 修改代码
vim src/features/docs.ts

# 2. 测试
pnpm run dev

# 3. 重复 1-2 直到功能完成
```

### 提交前检查

```bash
# 1. 确保构建通过
pnpm run build

# 2. 测试编译后的代码
pnpm start

# 3. 提交
git add .
git commit -m "feat: add terminal docs viewer"
```

### 发布前测试

```bash
# 1. 构建
pnpm run build

# 2. 全局测试
npm link
nbtca

# 3. 清理
npm unlink -g @nbtca/prompt
```

## 🎨 代码规范

- 使用 TypeScript 严格模式
- 函数添加 JSDoc 注释
- 导入模块使用 `.js` 后缀（即使是 `.ts` 文件）
- 保持代码简洁，避免过度抽象

## 📂 项目结构

```
src/
├── config/           # 配置常量
│   ├── data.ts      # URL、应用信息
│   └── theme.ts     # 颜色主题
│
├── core/            # 核心功能
│   ├── logo.ts      # Logo 显示
│   ├── menu.ts      # 主菜单
│   ├── ui.ts        # UI 组件
│   └── vim-keys.ts  # Vim 键位支持
│
├── features/        # 功能模块
│   ├── calendar.ts  # 活动日历
│   ├── docs.ts      # 知识库 ⭐ 新功能
│   ├── repair.ts    # 维修服务
│   └── website.ts   # 网站访问
│
├── logo/           # Logo 资源
├── index.ts        # 入口
├── main.ts         # 主逻辑
└── types.ts        # 类型定义
```

## 🌟 新功能说明

### 知识库终端查看器

**文件**: `src/features/docs.ts`

**核心功能**:
1. `fetchGitHubDirectory()` - 从 GitHub API 获取目录
2. `fetchGitHubRawContent()` - 获取文件原始内容
3. `browseDirectory()` - 交互式目录浏览
4. `viewMarkdownFile()` - 终端渲染 Markdown
5. `showDocsMenu()` - 主菜单入口

**依赖**:
- `axios` - HTTP 请求
- `marked` + `marked-terminal` - Markdown 渲染
- `inquirer` - 交互式选择
- `chalk` - 终端颜色

**测试要点**:
- [ ] GitHub API 正常调用
- [ ] 目录树正确显示
- [ ] Markdown 渲染美观
- [ ] 错误处理友好
- [ ] 导航流畅
