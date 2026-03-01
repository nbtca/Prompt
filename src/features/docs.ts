/**
 * 知识库终端查看模块
 * 获取并渲染Markdown文档
 */

import axios from 'axios';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';
import open from 'open';
import { select, isCancel, confirm } from '@clack/prompts';
import { error, warning, success, createSpinner } from '../core/ui.js';
import { spawn } from 'child_process';
import { t } from '../i18n/index.js';

/**
 * Terminal capability detection
 */
interface TerminalCapabilities {
  supportsColor: boolean;
  supportsImages: boolean;
  supportsUnicode: boolean;
  terminalType: 'basic' | 'enhanced' | 'advanced';
}

function detectTerminalCapabilities(): TerminalCapabilities {
  const term = (process.env['TERM'] || '').toLowerCase();
  const termProgram = (process.env['TERM_PROGRAM'] || '').toLowerCase();
  const colorTerm = process.env['COLORTERM'];

  const supportsImages =
    termProgram.includes('iterm') ||
    term.includes('kitty') ||
    termProgram.includes('wezterm') ||
    term.includes('sixel');

  const supportsColor =
    colorTerm !== undefined ||
    term.includes('color') ||
    term.includes('256') ||
    term.includes('ansi') ||
    termProgram !== '';

  const supportsUnicode =
    (process.env['LANG'] || '').includes('UTF-8') ||
    (process.env['LC_ALL'] || '').includes('UTF-8');

  let terminalType: 'basic' | 'enhanced' | 'advanced' = 'basic';
  if (supportsImages && supportsColor && supportsUnicode) {
    terminalType = 'advanced';
  } else if (supportsColor && supportsUnicode) {
    terminalType = 'enhanced';
  }

  return { supportsColor, supportsImages, supportsUnicode, terminalType };
}

function getRendererOptions(capabilities: TerminalCapabilities): any {
  const width = Math.min(process.stdout.columns || 80, 100);

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

  return {
    width,
    tableOptions: {
      chars: {
        top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
        right: '│', 'right-mid': '┤', middle: '│'
      }
    }
  };
}

const terminalCapabilities = detectTerminalCapabilities();

// @ts-ignore
marked.setOptions({ renderer: new TerminalRenderer(getRendererOptions(terminalCapabilities)) });

const GITHUB_REPO = { owner: 'nbtca', repo: 'documents', branch: 'main' };
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];

interface DocItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
}

const DOC_CATEGORIES = [
  { name: '📖  教程',             path: 'tutorial' },
  { name: '🔧  维修日记',         path: '维修日' },
  { name: '🎉  活动文档',         path: '相关活动举办' },
  { name: '📋  流程文档',         path: 'process' },
  { name: '🛠  维修相关',         path: 'repair' },
  { name: '📦  归档文档',         path: 'archived' },
  { name: '📄  项目说明 (README)', path: 'README.md' },
];

async function fetchGitHubDirectory(path: string = ''): Promise<DocItem[]> {
  const url = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/contents/${path}?ref=${GITHUB_REPO.branch}`;

  try {
    const headers: any = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NBTCA-CLI'
    };
    if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

    const response = await axios.get(url, { timeout: 10000, headers });

    return response.data
      .filter((item: any) => {
        if (item.name.startsWith('.')) return false;
        if (item.name === 'node_modules') return false;
        if (item.name === 'package.json') return false;
        if (item.name === 'pnpm-lock.yaml') return false;
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
        if (a.type === 'dir' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err: any) {
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

async function fetchGitHubRawContent(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/${GITHUB_REPO.branch}/${path}`;
  try {
    const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'NBTCA-CLI' } });
    return response.data;
  } catch (err: any) {
    throw new Error(`无法获取文件内容: ${err.message}`);
  }
}

function cleanMarkdownContent(content: string, capabilities: TerminalCapabilities): string {
  let cleaned = content;
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n/m, '');
  cleaned = cleaned.replace(/^:::(info|tip|warning|danger|details).*$/gm, '');
  cleaned = cleaned.replace(/^:::$/gm, '');
  cleaned = cleaned.replace(/\[\[toc\]\]/gi, '**目录**\n\n_(请在浏览器中查看完整目录)_\n');

  if (capabilities.terminalType === 'basic') {
    cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt) => `📎 [${alt || '图片'}]`);
  } else if (capabilities.terminalType === 'enhanced') {
    cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
      const filename = url.split('/').pop() || url;
      return `🖼️  **[图片: ${alt || '图片'}]**\n   _${filename}_`;
    });
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/<([a-z][a-z0-9]*)[^>]*>(.*?)<\/\1>/gi, '$2');
  cleaned = cleaned.trim();
  return cleaned;
}

function extractDocTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

async function displayInPager(content: string, title: string): Promise<boolean> {
  const trans = t();
  return new Promise((resolve) => {
    const pager = process.env['PAGER'] || 'less';
    const fullContent = `${chalk.cyan.bold(`>> ${title}`)}\n${chalk.gray('='.repeat(80))}\n\n${content}\n\n${chalk.gray('='.repeat(80))}\n${chalk.dim(trans.docs.endOfDocument)}\n`;
    const lessArgs = ['-R', '-F', '-X'];

    try {
      const child = spawn(pager, lessArgs, { stdio: ['pipe', 'inherit', 'inherit'], shell: true });
      child.stdin.write(fullContent);
      child.stdin.end();
      child.on('exit', (code) => resolve(code === 0));
      child.on('error', () => {
        console.error(chalk.yellow(trans.docs.pagerNotAvailable));
        console.log(fullContent);
        resolve(false);
      });
    } catch {
      console.log(fullContent);
      resolve(false);
    }
  });
}

/**
 * Browse a GitHub directory with @clack/prompts select()
 */
async function browseDirectory(dirPath: string = ''): Promise<void> {
  const trans = t();
  try {
    const s = createSpinner(dirPath ? `${trans.docs.loadingDir}: ${dirPath}` : trans.docs.loading);
    const items = await fetchGitHubDirectory(dirPath);
    s.stop('');

    if (items.length === 0) {
      warning(trans.docs.emptyDir);
      return;
    }

    const options = [
      ...(dirPath ? [{ value: '__back__', label: chalk.gray('↑  ' + trans.docs.upToParent) }] : []),
      ...items.map(item => ({
        value: item.path,
        label: item.type === 'dir'
          ? chalk.cyan('📁  ' + item.name + '/')
          : chalk.white('📄  ' + item.name),
        hint: item.type === 'dir' ? 'dir' : '.md',
      })),
      { value: '__exit__', label: chalk.gray('✕  ' + trans.docs.returnToMenu) },
    ];

    const selected = await select({
      message: dirPath ? `${trans.docs.currentDir}: ${dirPath}` : trans.docs.chooseDoc,
      options,
    });

    if (isCancel(selected) || selected === '__exit__') return;

    if (selected === '__back__') {
      const parentPath = dirPath.split('/').slice(0, -1).join('/');
      await browseDirectory(parentPath);
    } else {
      const item = items.find(i => i.path === selected);
      if (item?.type === 'dir') {
        await browseDirectory(selected);
      } else if (item?.type === 'file') {
        await viewMarkdownFile(selected);
        await browseDirectory(dirPath);
      }
    }
  } catch (err: any) {
    error(trans.docs.loadError);
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${err.message}`));

    const retry = await confirm({ message: trans.docs.retry });
    if (!isCancel(retry) && retry) {
      await browseDirectory(dirPath);
    }
  }
}

/**
 * View a markdown file using pager, then offer next-action select()
 */
async function viewMarkdownFile(path: string): Promise<void> {
  const trans = t();
  try {
    const s = createSpinner(`${trans.docs.loading.replace('...', '')}: ${path}`);
    const rawContent = await fetchGitHubRawContent(path);
    const cleanedContent = cleanMarkdownContent(rawContent, terminalCapabilities);
    const title = extractDocTitle(cleanedContent) || path.split('/').pop() || path;
    const rendered = await marked(cleanedContent);
    s.stop('');

    await displayInPager(rendered, `${title}\n${chalk.gray(`   ${path}`)}`);

    console.log();
    success(trans.docs.docCompleted);
    console.log();

    const action = await select({
      message: trans.docs.chooseAction,
      options: [
        { value: 'back',    label: trans.docs.backToList },
        { value: 'reread',  label: trans.docs.reread },
        { value: 'browser', label: trans.docs.openBrowser },
      ],
    });

    if (isCancel(action)) return;
    if (action === 'browser') await openDocsInBrowser(path);
    if (action === 'reread') await viewMarkdownFile(path);

  } catch (err: any) {
    error(trans.docs.loadError);
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${err.message}`));

    const openBrowser = await confirm({ message: trans.docs.openBrowserPrompt });
    if (!isCancel(openBrowser) && openBrowser) {
      await openDocsInBrowser(path);
    }
  }
}

/**
 * Open docs in browser with real spinner
 */
export async function openDocsInBrowser(path?: string): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.docs.opening);
  try {
    const url = path
      ? `https://docs.nbtca.space/${path.replace(/\.md$/, '')}`
      : 'https://docs.nbtca.space';
    await open(url);
    s.stop(trans.docs.browserOpened);
  } catch {
    s.error(trans.docs.browserError);
    console.log(chalk.gray(`  ${trans.docs.browserErrorHint}`));
  }
  console.log();
}

/**
 * Show docs category menu
 */
export async function showDocsMenu(): Promise<void> {
  const trans = t();
  while (true) {
    const options = [
      ...DOC_CATEGORIES.map(cat => ({ value: cat.path, label: cat.name })),
      { value: 'browser', label: chalk.gray('🌐  ' + trans.docs.openBrowser) },
      { value: 'back',    label: chalk.gray('←   ' + trans.docs.returnToMenu) },
    ];

    const action = await select({
      message: trans.docs.chooseCategory,
      options,
    });

    if (isCancel(action) || action === 'back') return;

    if (action === 'browser') {
      await openDocsInBrowser();
    } else if (action === 'README.md') {
      await viewMarkdownFile('README.md');
    } else {
      await browseDirectory(action);
    }
  }
}
