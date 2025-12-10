/**
 * 知识库终端查看模块
 * 获取并渲染Markdown文档
 */

import axios from 'axios';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';
import open from 'open';
import inquirer from 'inquirer';
import { error, info, success, warning } from '../core/ui.js';
import { spawn } from 'child_process';
import { t } from '../i18n/index.js';

/**
 * Terminal capability detection
 * Detects if the terminal supports advanced features like images, colors, etc.
 */
interface TerminalCapabilities {
  supportsColor: boolean;
  supportsImages: boolean;
  supportsUnicode: boolean;
  terminalType: 'basic' | 'enhanced' | 'advanced';
}

/**
 * Detect terminal capabilities
 */
function detectTerminalCapabilities(): TerminalCapabilities {
  const term = (process.env['TERM'] || '').toLowerCase();
  const termProgram = (process.env['TERM_PROGRAM'] || '').toLowerCase();
  const colorTerm = process.env['COLORTERM'];

  // Detect image support (iTerm2, Kitty, WezTerm, etc.)
  const supportsImages =
    termProgram.includes('iterm') ||
    term.includes('kitty') ||
    termProgram.includes('wezterm') ||
    term.includes('sixel');

  // Detect color support
  const supportsColor =
    colorTerm !== undefined ||
    term.includes('color') ||
    term.includes('256') ||
    term.includes('ansi') ||
    termProgram !== '';

  // Detect Unicode support
  const supportsUnicode =
    (process.env['LANG'] || '').includes('UTF-8') ||
    (process.env['LC_ALL'] || '').includes('UTF-8');

  // Determine terminal type
  let terminalType: 'basic' | 'enhanced' | 'advanced' = 'basic';
  if (supportsImages && supportsColor && supportsUnicode) {
    terminalType = 'advanced';
  } else if (supportsColor && supportsUnicode) {
    terminalType = 'enhanced';
  }

  return {
    supportsColor,
    supportsImages,
    supportsUnicode,
    terminalType
  };
}

/**
 * Get marked-terminal renderer options based on terminal capabilities
 */
function getRendererOptions(capabilities: TerminalCapabilities): any {
  // Text width for better readability
  const width = Math.min(process.stdout.columns || 80, 100);

  // For basic terminals, use simpler ASCII characters
  if (capabilities.terminalType === 'basic') {
    return {
      width,
      tableOptions: {
        chars: {
          top: '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
          bottom: '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
          left: '|', 'left-mid': '+', mid: '-', 'mid-mid': '+',
          right: '|', 'right-mid': '+', middle: '|'
        }
      }
    };
  }

  // For enhanced and advanced terminals, use Unicode box-drawing characters
  return {
    width,
    tableOptions: {
      chars: {
        top: '─',
        'top-mid': '┬',
        'top-left': '┌',
        'top-right': '┐',
        bottom: '─',
        'bottom-mid': '┴',
        'bottom-left': '└',
        'bottom-right': '┘',
        left: '│',
        'left-mid': '├',
        mid: '─',
        'mid-mid': '┼',
        right: '│',
        'right-mid': '┤',
        middle: '│'
      }
    }
  };
}

// Detect terminal capabilities once at startup
const terminalCapabilities = detectTerminalCapabilities();

// Configure marked with terminal-optimized renderer
marked.setOptions({
  // @ts-ignore - markedTerminal类型定义问题
  renderer: new TerminalRenderer(getRendererOptions(terminalCapabilities))
});

/**
 * GitHub仓库配置
 */
const GITHUB_REPO = {
  owner: 'nbtca',
  repo: 'documents',
  branch: 'main'
};

/**
 * GitHub Token (可选 - 用于避免 API 速率限制)
 * 从环境变量读取，如果没有则使用未认证请求
 */
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];

/**
 * 文档结构类型
 */
interface DocItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
}

/**
 * 预定义的文档分类
 */
const DOC_CATEGORIES = [
  { name: '[Tutorial]    教程', path: 'tutorial' },
  { name: '[Repair]      维修日', path: '维修日' },
  { name: '[Events]      相关活动举办', path: '相关活动举办' },
  { name: '[Process]     流程文档', path: 'process' },
  { name: '[Repair]      维修相关', path: 'repair' },
  { name: '[Archive]     归档文档', path: 'archived' },
  { name: '[README]      项目说明', path: 'README.md' }
];

/**
 * 从GitHub获取目录内容
 */
async function fetchGitHubDirectory(path: string = ''): Promise<DocItem[]> {
  const url = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/contents/${path}?ref=${GITHUB_REPO.branch}`;

  try {
    const headers: any = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NBTCA-CLI'
    };

    // 如果有 GitHub Token，添加认证头以避免速率限制
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    const response = await axios.get(url, {
      timeout: 10000,
      headers
    });

    return response.data
      .filter((item: any) => {
        // 过滤掉 node_modules, .git 等目录
        if (item.name.startsWith('.')) return false;
        if (item.name === 'node_modules') return false;
        if (item.name === 'package.json') return false;
        if (item.name === 'pnpm-lock.yaml') return false;

        // 只显示目录和 markdown 文件
        if (item.type === 'file' && !item.name.endsWith('.md')) return false;

        return true;
      })
      .map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        sha: item.sha
      }))
      .sort((a: DocItem, b: DocItem) => {
        // 目录排在前面
        if (a.type === 'dir' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err: any) {
    // 提供更详细的错误信息
    if (err.response?.status === 403) {
      const rateLimitRemaining = err.response.headers['x-ratelimit-remaining'];
      const rateLimitReset = err.response.headers['x-ratelimit-reset'];

      if (rateLimitRemaining === '0') {
        const resetDate = new Date(parseInt(rateLimitReset) * 1000);
        throw new Error(`GitHub API 速率限制已达上限，将在 ${resetDate.toLocaleTimeString()} 重置。\n提示: 设置 GITHUB_TOKEN 环境变量可获得更高的速率限制。`);
      }
      throw new Error(`GitHub API 拒绝访问 (403)。\n提示: 尝试设置 GITHUB_TOKEN 环境变量。`);
    }
    throw new Error(`无法获取目录内容: ${err.message}`);
  }
}

/**
 * 从GitHub获取文件原始内容
 */
async function fetchGitHubRawContent(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/${GITHUB_REPO.branch}/${path}`;

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'NBTCA-CLI'
      }
    });

    return response.data;
  } catch (err: any) {
    throw new Error(`无法获取文件内容: ${err.message}`);
  }
}

/**
 * 清理和格式化Markdown内容
 * 移除VitePress frontmatter和特殊语法，优化终端显示
 */
function cleanMarkdownContent(content: string, capabilities: TerminalCapabilities): string {
  let cleaned = content;

  // 1. 移除 YAML frontmatter (---开头结尾的部分)
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n/m, '');

  // 2. 移除 VitePress 的特殊容器语法 (:::info, :::tip, :::warning 等)
  // 保留内容，只移除容器标记
  cleaned = cleaned.replace(/^:::(info|tip|warning|danger|details).*$/gm, '');
  cleaned = cleaned.replace(/^:::$/gm, '');

  // 3. 处理 VitePress 的 [[toc]] 语法
  cleaned = cleaned.replace(/\[\[toc\]\]/gi, '**目录**\n\n_(请在浏览器中查看完整目录)_\n');

  // 4. 优化图片显示 - 根据终端能力调整
  if (capabilities.terminalType === 'basic') {
    // Basic terminals: Replace images with simple text references
    // This prevents clutter from image syntax that can't be displayed
    cleaned = cleaned.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt, _url) => {
        const description = alt || '图片';
        return `📎 [${description}]`;
      }
    );
  } else if (capabilities.terminalType === 'enhanced') {
    // Enhanced terminals: Keep alt text and show it's an image
    cleaned = cleaned.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt, url) => {
        const description = alt || '图片';
        const filename = url.split('/').pop() || url;
        return `🖼️  **[图片: ${description}]**\n   _${filename}_`;
      }
    );
  }
  // For advanced terminals (supportsImages), keep original markdown
  // marked-terminal will handle the image syntax appropriately

  // 5. 清理多余的空行（超过2个连续空行压缩为2个）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 6. 移除 HTML 注释
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 7. 移除 HTML 标签但保留内容 (for better terminal display)
  cleaned = cleaned.replace(/<([a-z][a-z0-9]*)[^>]*>(.*?)<\/\1>/gi, '$2');

  // 8. 清理开头和结尾的空白
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * 提取文档标题（从第一个 # 标题）
 */
function extractDocTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * 浏览目录并选择文档
 */
async function browseDirectory(dirPath: string = ''): Promise<void> {
  const trans = t();
  try {
    info(dirPath ? `${trans.docs.loadingDir}: ${dirPath}` : trans.docs.loading);

    const items = await fetchGitHubDirectory(dirPath);

    console.log('\r' + ' '.repeat(60) + '\r'); // 清除加载提示

    if (items.length === 0) {
      warning(trans.docs.emptyDir);
      return;
    }

    // 构建选择列表
    const choices = [
      ...(dirPath ? [
        { name: chalk.gray(trans.docs.upToParent), value: { type: 'back' } },
        new inquirer.Separator()
      ] : []),
      ...items.map(item => ({
        name: item.type === 'dir'
          ? chalk.cyan(`[DIR] ${item.name}/`)
          : chalk.white(`[MD]  ${item.name}`),
        value: item
      })),
      new inquirer.Separator(),
      { name: chalk.gray(trans.docs.returnToMenu), value: { type: 'exit' } }
    ];

    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: dirPath ? `${trans.docs.currentDir}: ${dirPath}` : trans.docs.chooseDoc,
        choices,
        pageSize: 15,
        loop: false
      }
    ]);

    // 处理用户选择
    if (selected.type === 'exit') {
      return;
    } else if (selected.type === 'back') {
      // 返回上级目录
      const parentPath = dirPath.split('/').slice(0, -1).join('/');
      await browseDirectory(parentPath);
    } else if (selected.type === 'dir') {
      // 进入子目录
      await browseDirectory(selected.path);
    } else if (selected.type === 'file') {
      // 查看文件
      await viewMarkdownFile(selected.path);
      // 查看完后继续浏览当前目录
      await browseDirectory(dirPath);
    }

  } catch (err: any) {
    error(trans.docs.loadError);
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${err.message}`));

    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: trans.docs.retry,
        default: true
      }
    ]);

    if (retry) {
      await browseDirectory(dirPath);
    }
  }
}

/**
 * 使用系统pager (less/more) 显示内容
 * 提供类似vim/journalctl的阅读体验
 */
async function displayInPager(content: string, title: string): Promise<boolean> {
  const trans = t();
  return new Promise((resolve) => {
    // 检测可用的pager程序
    const pager = process.env['PAGER'] || 'less';

    // 为内容添加标题
    const fullContent = `${chalk.cyan.bold(`>> ${title}`)}\n${chalk.gray('='.repeat(80))}\n\n${content}\n\n${chalk.gray('='.repeat(80))}\n${chalk.dim(trans.docs.endOfDocument)}\n`;

    // less的参数: -R (支持颜色), -F (如果内容少于一屏则直接显示), -X (退出时不清屏)
    const lessArgs = ['-R', '-F', '-X'];

    try {
      const child = spawn(pager, lessArgs, {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true
      });

      // 将内容写入pager的stdin
      child.stdin.write(fullContent);
      child.stdin.end();

      child.on('exit', (code) => {
        resolve(code === 0);
      });

      child.on('error', () => {
        // 如果pager失败，回退到直接输出
        console.error(chalk.yellow(trans.docs.pagerNotAvailable));
        console.log(fullContent);
        resolve(false);
      });

    } catch {
      // 回退方案: 直接输出
      console.log(fullContent);
      resolve(false);
    }
  });
}

/**
 * 查看Markdown文件
 */
async function viewMarkdownFile(path: string): Promise<void> {
  const trans = t();
  try {
    info(`${trans.docs.loading.replace('...', '')}: ${path}`);

    // 从GitHub获取原始Markdown内容
    const rawContent = await fetchGitHubRawContent(path);

    // 清理VitePress特殊语法 - 使用终端能力优化显示
    const cleanedContent = cleanMarkdownContent(rawContent, terminalCapabilities);

    // 提取标题
    const title = extractDocTitle(cleanedContent) || path.split('/').pop() || path;

    // 渲染Markdown到终端
    const rendered = await marked(cleanedContent);

    console.log('\r' + ' '.repeat(60) + '\r'); // 清除加载提示

    // 使用pager显示文档 (类似vim/journalctl的阅读体验)
    await displayInPager(rendered, `${title}\n${chalk.gray(`   ${path}`)}`);

    console.log(); // 添加空行
    success(trans.docs.docCompleted);
    console.log();

    // 提供后续操作选项
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: trans.docs.chooseAction,
        choices: [
          { name: trans.docs.backToList, value: 'back' },
          { name: trans.docs.reread, value: 'reread' },
          { name: trans.docs.openBrowser, value: 'browser' }
        ]
      }
    ]);

    if (action === 'browser') {
      await openDocsInBrowser(path);
    } else if (action === 'reread') {
      // 重新阅读文档
      await viewMarkdownFile(path);
    }

  } catch (err: any) {
    console.log('\r' + ' '.repeat(60) + '\r');
    error(trans.docs.loadError);
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${err.message}`));
    warning(trans.docs.openBrowserPrompt.replace('是否', '建议'));
    console.log();

    const { openBrowser } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'openBrowser',
        message: trans.docs.openBrowserPrompt,
        default: true
      }
    ]);

    if (openBrowser) {
      await openDocsInBrowser(path);
    }
  }
}

/**
 * 在浏览器中打开知识库
 */
export async function openDocsInBrowser(path?: string): Promise<void> {
  const trans = t();
  try {
    info(trans.docs.opening);
    const url = path
      ? `https://docs.nbtca.space/${path.replace(/\.md$/, '')}`
      : 'https://docs.nbtca.space';
    await open(url);
    success(trans.docs.browserOpened);
  } catch (err) {
    error(trans.docs.browserError);
    console.log(chalk.gray(`  ${trans.docs.browserErrorHint}`));
  }
  console.log();
}

/**
 * 显示知识库菜单
 */
export async function showDocsMenu(): Promise<void> {
  const trans = t();
  console.log();
  console.log(chalk.cyan.bold(`  >> ${trans.docs.title}`));
  console.log(chalk.dim(`     ${trans.docs.subtitle}`));

  // 显示终端能力信息 - 帮助用户了解文档渲染能力
  const terminalTypeDisplay = {
    'basic': chalk.yellow('基础'),
    'enhanced': chalk.cyan('增强'),
    'advanced': chalk.green('高级')
  }[terminalCapabilities.terminalType];

  console.log(chalk.dim(`     终端类型: ${terminalTypeDisplay} | 支持: ${
    [
      terminalCapabilities.supportsColor && '彩色',
      terminalCapabilities.supportsUnicode && 'Unicode',
      terminalCapabilities.supportsImages && '图片'
    ].filter(Boolean).join(', ') || '纯文本'
  }`));
  console.log();

  const choices = [
    ...DOC_CATEGORIES.map(cat => ({
      name: cat.name,
      value: cat.path
    })),
    new inquirer.Separator(),
    { name: chalk.gray(trans.docs.openBrowser), value: 'browser' },
    { name: chalk.gray(trans.docs.returnToMenu), value: 'back' }
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: trans.docs.chooseCategory,
      choices,
      pageSize: 15,
      loop: false
    }
  ]);

  if (action === 'back') {
    return;
  } else if (action === 'browser') {
    await openDocsInBrowser();
  } else if (action === 'README.md') {
    // 直接查看 README
    await viewMarkdownFile('README.md');
  } else {
    // 浏览指定目录
    await browseDirectory(action);
  }
}

