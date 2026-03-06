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
import { pickIcon } from '../core/icons.js';
import { spawn, execFileSync } from 'child_process';
import { URLS } from '../config/data.js';
import { t } from '../i18n/index.js';

// ─── Terminal capability detection ───────────────────────────────────────────

type TerminalType = 'basic' | 'enhanced' | 'advanced';

function detectTerminalType(): TerminalType {
  const term        = (process.env['TERM']         || '').toLowerCase();
  const termProgram = (process.env['TERM_PROGRAM'] || '').toLowerCase();

  const hasImages  = termProgram.includes('iterm') || term.includes('kitty') ||
                     termProgram.includes('wezterm') || term.includes('sixel');
  const hasColor   = process.env['COLORTERM'] !== undefined || term.includes('color') ||
                     term.includes('256') || term.includes('ansi') || termProgram !== '';
  const hasUnicode = (process.env['LANG']   || '').includes('UTF-8') ||
                     (process.env['LC_ALL'] || '').includes('UTF-8');

  if (hasImages && hasColor && hasUnicode) return 'advanced';
  if (hasColor  && hasUnicode)             return 'enhanced';
  return 'basic';
}

/** Check whether an external command exists on PATH (once at startup). */
function commandExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const TERMINAL_TYPE = detectTerminalType();
const HAS_GLOW = commandExists('glow');

// ─── marked-terminal renderer ─────────────────────────────────────────────────

function getRendererOptions(type: TerminalType): any {
  // Cap at 80 columns — optimal prose reading width regardless of terminal size
  const width = Math.min(process.stdout.columns || 80, 80);

  const unicodeTableChars = {
    top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
    bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
    left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
    right: '│', 'right-mid': '┤', middle: '│'
  };

  const asciiTableChars = {
    top: '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
    bottom: '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
    left: '|', 'left-mid': '+', mid: '-', 'mid-mid': '+',
    right: '|', 'right-mid': '+', middle: '|'
  };

  return {
    width,
    emoji: true,
    unescape: true,

    // Heading hierarchy: h1 cyan, h2+ white bold
    firstHeading: chalk.bold.cyan,
    heading: chalk.bold.white,

    // Inline code: bright yellow, distinct from prose
    codespan: chalk.yellowBright,

    // Block code: yellow (marked-terminal applies per-line)
    code: chalk.yellow,

    // Blockquotes: italic gray, visually recessed
    blockquote: chalk.italic.gray,

    // Prose emphasis
    strong: chalk.bold,
    em: chalk.italic,
    del: chalk.dim.strikethrough,

    // Links: cyan underline
    link: chalk.cyan,
    href: chalk.cyan.underline,

    // Tables with Unicode borders (fallback to ASCII on basic terminals)
    tableOptions: {
      chars: type === 'basic' ? asciiTableChars : unicodeTableChars
    }
  };
}

// @ts-ignore
marked.setOptions({ renderer: new TerminalRenderer(getRendererOptions(TERMINAL_TYPE)) });

// ─── GitHub data layer ────────────────────────────────────────────────────────

const GITHUB_REPO = { owner: 'nbtca', repo: 'documents', branch: 'main' };
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];

interface DocItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
}

interface CachedFetchResult<T> {
  data: T;
  fromCache: boolean;
  staleFallback: boolean;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface RenderedDoc {
  fingerprint: string;
  cleaned: string;
  rendered: string;
  title: string;
  readTime: string;
}

const SKIP_NAMES = new Set(['node_modules', 'package.json', 'pnpm-lock.yaml']);
const DIR_CACHE_TTL_MS = 5 * 60 * 1000;
const FILE_CACHE_TTL_MS = 10 * 60 * 1000;
const RENDER_CACHE_TTL_MS = 10 * 60 * 1000;
const dirCache = new Map<string, CacheEntry<DocItem[]>>();
const fileCache = new Map<string, CacheEntry<string>>();
const renderCache = new Map<string, CacheEntry<RenderedDoc>>();

function getDocCategories() {
  const trans = t();
  const withIcon = (unicodeIcon: string, asciiIcon: string, label: string) =>
    `${pickIcon(unicodeIcon, asciiIcon)} ${label}`;
  return [
    { name: withIcon('📖', '[DOC]', trans.docs.categoryTutorial),   path: 'tutorial' },
    { name: withIcon('🔧', '[LOG]', trans.docs.categoryRepairLogs), path: '维修日' },
    { name: withIcon('🎉', '[EVT]', trans.docs.categoryEvents),     path: '相关活动举办' },
    { name: withIcon('📋', '[PROC]', trans.docs.categoryProcess),   path: 'process' },
    { name: withIcon('🛠', '[FIX]', trans.docs.categoryRepair),     path: 'repair' },
    { name: withIcon('📦', '[ARC]', trans.docs.categoryArchived),   path: 'archived' },
    { name: withIcon('📄', '[README]', trans.docs.categoryReadme),  path: 'README.md' },
  ];
}

function getFreshCacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt > Date.now()) return entry.value;
  return null;
}

function getAnyCacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  return entry?.value ?? null;
}

function setCacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function contentFingerprint(content: string): string {
  const head = content.slice(0, 80);
  const tail = content.slice(-80);
  return `${content.length}:${head}:${tail}`;
}

export function clearDocsCache(): void {
  dirCache.clear();
  fileCache.clear();
  renderCache.clear();
}

async function fetchGitHubDirectory(
  path: string = '',
  options: { forceRefresh?: boolean } = {}
): Promise<CachedFetchResult<DocItem[]>> {
  const cacheKey = path || '__root__';
  if (!options.forceRefresh) {
    const cached = getFreshCacheValue(dirCache, cacheKey);
    if (cached) {
      return { data: cached, fromCache: true, staleFallback: false };
    }
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/contents/${path}?ref=${GITHUB_REPO.branch}`;

  try {
    const headers: any = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NBTCA-CLI'
    };
    if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

    const response = await axios.get(url, { timeout: 10000, headers });

    const items = response.data
      .filter((item: any) =>
        !item.name.startsWith('.') &&
        !SKIP_NAMES.has(item.name) &&
        !(item.type === 'file' && !item.name.endsWith('.md'))
      )
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

    setCacheValue(dirCache, cacheKey, items, DIR_CACHE_TTL_MS);
    return { data: items, fromCache: false, staleFallback: false };
  } catch (err: any) {
    const staleCached = getAnyCacheValue(dirCache, cacheKey);
    if (staleCached) {
      return { data: staleCached, fromCache: true, staleFallback: true };
    }

    const trans = t();
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (err.response?.status === 403) {
      const rateLimitRemaining = err.response.headers['x-ratelimit-remaining'];
      const rateLimitReset = err.response.headers['x-ratelimit-reset'];
      if (rateLimitRemaining === '0') {
        const resetDate = new Date(parseInt(rateLimitReset) * 1000);
        throw new Error(
          `${trans.docs.githubRateLimited.replace('{time}', resetDate.toLocaleTimeString())}\n${trans.docs.githubTokenHint}`
        );
      }
      throw new Error(`${trans.docs.githubForbidden}\n${trans.docs.githubTokenHint}`);
    }
    throw new Error(trans.docs.fetchDirFailed.replace('{error}', errorMessage));
  }
}

async function fetchGitHubRawContent(
  path: string,
  options: { forceRefresh?: boolean } = {}
): Promise<CachedFetchResult<string>> {
  if (!options.forceRefresh) {
    const cached = getFreshCacheValue(fileCache, path);
    if (cached) {
      return { data: cached, fromCache: true, staleFallback: false };
    }
  }

  const url = `https://raw.githubusercontent.com/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/${GITHUB_REPO.branch}/${path}`;
  try {
    const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'NBTCA-CLI' } });
    const content = String(response.data);
    setCacheValue(fileCache, path, content, FILE_CACHE_TTL_MS);
    return { data: content, fromCache: false, staleFallback: false };
  } catch (err: any) {
    const staleCached = getAnyCacheValue(fileCache, path);
    if (staleCached) {
      return { data: staleCached, fromCache: true, staleFallback: true };
    }

    const trans = t();
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(trans.docs.fetchFileFailed.replace('{error}', errorMessage));
  }
}

// ─── Content cleaning ─────────────────────────────────────────────────────────

const CONTAINER_ICONS_ASCII: Record<string, string> = {
  info: '[INFO]', tip: '[TIP]', warning: '[WARN]', danger: '[DANGER]', details: '[DETAIL]'
};
const CONTAINER_ICONS_UNICODE: Record<string, string> = {
  info: 'ℹ️', tip: '💡', warning: '⚠️', danger: '🚨', details: '▶️'
};

function cleanMarkdownContent(content: string, type: TerminalType): string {
  let c = content;

  // 1. YAML frontmatter
  c = c.replace(/^---\n[\s\S]*?\n---\n?/m, '');

  // 2. VitePress script / style blocks
  c = c.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  c = c.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // 3. VitePress containers → blockquote with icon
  //    ::: warning Title\ncontent\n:::
  c = c.replace(
    /^:::\s*(info|tip|warning|danger|details)\s*(.*?)\n([\s\S]*?)^:::\s*$/gm,
    (_m, type: string, title: string, body: string) => {
      const label = (title.trim() || type.charAt(0).toUpperCase() + type.slice(1));
      const icon = pickIcon(CONTAINER_ICONS_UNICODE[type] ?? '', CONTAINER_ICONS_ASCII[type] ?? '');
      const quoted = body.trimEnd().split('\n').map(l => `> ${l}`).join('\n');
      return `> ${icon} **${label}**\n>\n${quoted}\n`;
    }
  );
  // Remaining bare ::: markers
  c = c.replace(/^:::\s*\w*.*$/gm, '');

  // 4. GitHub / GitLab callout alerts  (> [!NOTE])
  c = c.replace(/^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/gim,
    (_, type: string) => `> **${type.charAt(0) + type.slice(1).toLowerCase()}:**`
  );

  // 5. [[toc]] — no value in terminal
  c = c.replace(/\[\[toc\]\]/gi, '');

  // 6. Images — adapt to terminal capability
  if (type === 'basic') {
    c = c.replace(
      /!\[([^\]]*)\]\([^)]+\)/g,
      (_, alt) => `${pickIcon('📎', '[image]')} ${alt || 'image'}`
    );
  } else if (type === 'enhanced') {
    c = c.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const filename = (url as string).split('/').pop() || url;
      return `${pickIcon('🖼️', '[image]')} **${alt || 'image'}** _(${filename})_`;
    });
  }

  // 7. HTML comments
  c = c.replace(/<!--[\s\S]*?-->/g, '');

  // 8. Strip HTML tags, keep inner text
  c = c.replace(/<([a-z][a-z0-9]*)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2');
  c = c.replace(/<[a-z][a-z0-9]*\b[^>]*\/>/gi, '');

  // 9. Collapse runs of 3+ blank lines
  c = c.replace(/\n{3,}/g, '\n\n');

  return c.trim();
}

function extractDocTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/** Approximate reading time: ~200 words/min for technical Chinese/English prose. */
function estimateReadTime(text: string): string {
  const cjkChars = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const nonCjk = text.replace(/[\u3400-\u9fff]/g, ' ');
  const words = nonCjk.trim().split(/\s+/).filter(Boolean).length;
  // Rough equivalence: 2 CJK chars ~= 1 "word" unit
  const units = words + cjkChars / 2;
  const mins = Math.max(1, Math.ceil(units / 220));
  return mins === 1 ? '~1 min' : `~${mins} min`;
}

// ─── Pager layer ──────────────────────────────────────────────────────────────

/**
 * Display markdown via `glow` (Charmbracelet) if available — best-in-class
 * terminal markdown rendering with built-in pager and mouse support.
 */
async function displayWithGlow(cleanedMarkdown: string): Promise<void> {
  const cols = String(Math.min(process.stdout.columns || 80, 80));
  return new Promise(resolve => {
    const child = spawn('glow', ['--pager', '--width', cols, '-'], {
      stdio: ['pipe', 'inherit', 'inherit']
    });
    child.stdin.write(cleanedMarkdown, 'utf-8');
    child.stdin.end();
    child.on('close', resolve);
    child.on('error', resolve); // glow vanished mid-run — caller handles fallback
  });
}

/**
 * Display rendered markdown via `less` with a structured document frame.
 * Flags:
 *   -R  pass raw ANSI codes through
 *   -F  exit immediately if content fits on one screen
 *   -X  don't clear the screen on exit
 *   -i  case-insensitive search (/ to search)
 *   -j4 place search hits 4 lines from the top (less jarring)
 */
async function displayWithLess(
  rendered: string,
  title: string,
  filePath: string,
  readTime: string
): Promise<void> {
  const trans = t();
  const cols = Math.min(process.stdout.columns || 80, 80);
  const rule = chalk.dim('-'.repeat(cols));

  const header = [
    '',
    chalk.bold.cyan(`  ${title}`),
    chalk.dim(`  ${filePath}`) + chalk.dim(`  |  ${readTime}`),
    rule,
    '',
  ].join('\n');

  const footer = [
    '',
    rule,
    chalk.dim(`  ${trans.docs.endOfDocument}  |  / to search`),
    '',
  ].join('\n');

  const fullContent = header + rendered + footer;
  const pagerSetting = (process.env['PAGER'] || 'less').trim();
  const [pagerCommand = 'less', ...pagerArgs] = pagerSetting.split(/\s+/).filter(Boolean);
  const args = [...pagerArgs, '-R', '-F', '-X', '-i', '-j4'];

  if (!commandExists(pagerCommand)) {
    console.log(fullContent);
    return;
  }

  return new Promise(resolve => {
    try {
      const child = spawn(pagerCommand, args, { stdio: ['pipe', 'inherit', 'inherit'] });
      child.stdin.write(fullContent, 'utf-8');
      child.stdin.end();
      child.on('close', resolve);
      child.on('error', () => { console.log(fullContent); resolve(); });
    } catch {
      console.log(fullContent);
      resolve();
    }
  });
}

// ─── Directory browser ────────────────────────────────────────────────────────

async function browseDirectory(dirPath: string = ''): Promise<void> {
  const trans = t();
  try {
    const s = createSpinner(dirPath ? `${trans.docs.loadingDir}: ${dirPath}` : trans.docs.loading);
    const result = await fetchGitHubDirectory(dirPath);
    const items = result.data;
    s.stop('');

    if (result.staleFallback) {
      warning(trans.docs.usingCachedData);
    }

    if (items.length === 0) {
      warning(trans.docs.emptyDir);
      return;
    }

    const options = [
      ...(dirPath ? [{ value: '__back__', label: chalk.gray(`${pickIcon('↑', '[..]')} ${trans.docs.upToParent}`) }] : []),
      ...items.map(item => ({
        value: item.path,
        label: item.type === 'dir'
          ? chalk.cyan(`${pickIcon('📁', '[DIR]')} ${item.name}/`)
          : chalk.white(`${pickIcon('📄', '[MD]')} ${item.name}`),
        hint: item.type === 'dir' ? 'dir' : '.md',
      })),
      { value: '__exit__', label: chalk.gray(`${pickIcon('✕', '[x]')} ${trans.docs.returnToMenu}`) },
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

// ─── Document viewer ──────────────────────────────────────────────────────────

async function viewMarkdownFile(filePath: string): Promise<void> {
  const trans = t();
  try {
    const s = createSpinner(`${trans.docs.loading.replace('...', '')}: ${filePath}`);

    const rawResult = await fetchGitHubRawContent(filePath);
    if (rawResult.staleFallback) {
      warning(trans.docs.usingCachedData);
    }

    const rawContent = rawResult.data;
    const fingerprint = contentFingerprint(rawContent);
    const cachedRendered = getFreshCacheValue(renderCache, filePath);

    let renderedDoc: RenderedDoc;
    if (cachedRendered && cachedRendered.fingerprint === fingerprint) {
      renderedDoc = cachedRendered;
    } else {
      const cleaned = cleanMarkdownContent(rawContent, TERMINAL_TYPE);
      const title = extractDocTitle(cleaned) || filePath.split('/').pop() || filePath;
      const readTime = estimateReadTime(cleaned);
      const rendered = await marked(cleaned) as string;
      renderedDoc = { fingerprint, cleaned, rendered, title, readTime };
      setCacheValue(renderCache, filePath, renderedDoc, RENDER_CACHE_TTL_MS);
    }

    s.stop(`${chalk.bold(renderedDoc.title)}  ${chalk.dim(renderedDoc.readTime)}`);

    if (HAS_GLOW) {
      await displayWithGlow(renderedDoc.cleaned);
    } else {
      await displayWithLess(renderedDoc.rendered, renderedDoc.title, filePath, renderedDoc.readTime);
    }

    console.log();
    success(trans.docs.docCompleted);
    console.log();

    const action = await select({
      message: trans.docs.chooseAction,
      options: [
        { value: 'back',    label: `${pickIcon('←', '[<]')} ${trans.docs.backToList}` },
        { value: 'reread',  label: `${pickIcon('↻', '[r]')} ${trans.docs.reread}` },
        { value: 'browser', label: `${pickIcon('🌐', '[*]')} ${trans.docs.openBrowser}` },
      ],
    });

    if (isCancel(action)) return;
    if (action === 'browser') await openDocsInBrowser(filePath);
    if (action === 'reread')  await viewMarkdownFile(filePath);

  } catch (err: any) {
    error(trans.docs.loadError);
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${err.message}`));

    const openBrowser = await confirm({ message: trans.docs.openBrowserPrompt });
    if (!isCancel(openBrowser) && openBrowser) {
      await openDocsInBrowser(filePath);
    }
  }
}

// ─── Browser fallback ─────────────────────────────────────────────────────────

export async function openDocsInBrowser(path?: string): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.docs.opening);
  try {
    const url = path
      ? `${URLS.docs}/${path.replace(/\.md$/, '')}`
      : URLS.docs;
    await open(url);
    s.stop(trans.docs.browserOpened);
  } catch {
    s.error(trans.docs.browserError);
    console.log(chalk.gray(`  ${trans.docs.browserErrorHint}`));
  }
  console.log();
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function showDocsMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const categories = getDocCategories();
    const options = [
      ...categories.map(cat => ({ value: cat.path, label: cat.name })),
      { value: 'refresh-cache', label: chalk.gray(`${pickIcon('♻️', '[r]')} ${trans.docs.refreshCache}`) },
      { value: 'browser', label: chalk.gray(`${pickIcon('🌐', '[*]')} ${trans.docs.openBrowser}`) },
      { value: 'back',    label: chalk.gray(`${pickIcon('←', '[^]')} ${trans.docs.returnToMenu}`) },
    ];

    const action = await select({
      message: trans.docs.chooseCategory,
      options,
    });

    if (isCancel(action) || action === 'back') return;

    if (action === 'refresh-cache') {
      clearDocsCache();
      success(trans.docs.cacheCleared);
    } else if (action === 'browser') {
      await openDocsInBrowser();
    } else if (action === 'README.md') {
      await viewMarkdownFile('README.md');
    } else {
      await browseDirectory(action);
    }
  }
}
