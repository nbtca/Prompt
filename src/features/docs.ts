/**
 * 知识库终端查看模块
 * 获取并渲染Markdown文档
 */

import axios from 'axios';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';
import open from 'open';
import { select, isCancel, confirm, text } from '@clack/prompts';
import { error, warning, success, createSpinner } from '../core/ui.js';
import { pickIcon } from '../core/icons.js';
import { spawn, execFileSync } from 'child_process';
import { APP_INFO, GITHUB_REPO, URLS } from '../config/data.js';
import { t } from '../i18n/index.js';
import { setVimKeysActive } from '../core/vim-keys.js';

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

let _terminalType: TerminalType | null = null;
function getTerminalType(): TerminalType {
  if (_terminalType === null) _terminalType = detectTerminalType();
  return _terminalType;
}

let _hasGlow: boolean | null = null;
function hasGlow(): boolean {
  if (_hasGlow === null) _hasGlow = commandExists('glow');
  return _hasGlow;
}

let _markedConfigured = false;
function ensureMarkedConfigured(): void {
  if (_markedConfigured) return;
  _markedConfigured = true;
  // @ts-ignore - marked v11 / marked-terminal v7 type incompatibility
  marked.setOptions({ renderer: new TerminalRenderer(getRendererOptions(getTerminalType())) });
}

// ─── marked-terminal renderer ─────────────────────────────────────────────────

function getRendererOptions(type: TerminalType): Record<string, unknown> {
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


// ─── GitHub data layer ────────────────────────────────────────────────────────


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
  return [
    { name: trans.docs.categoryTutorial,    path: 'tutorial' },
    { name: trans.docs.categoryRepairLogs,  path: '维修日' },
    { name: trans.docs.categoryEvents,      path: '相关活动举办' },
    { name: trans.docs.categoryProcess,     path: 'process' },
    { name: trans.docs.categoryRepair,      path: 'repair' },
    { name: trans.docs.categoryArchived,    path: 'archived' },
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
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': `NBTCA-CLI/${APP_INFO.version}`
    };
    if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

    const response = await axios.get(url, { timeout: 10000, headers });

    interface GitHubContentItem { name: string; path: string; type: string; sha: string }
    const items = (response.data as GitHubContentItem[])
      .filter((item) =>
        !item.name.startsWith('.') &&
        !SKIP_NAMES.has(item.name) &&
        !(item.type === 'file' && !item.name.endsWith('.md'))
      )
      .map((item) => ({
        name: item.name,
        path: item.path,
        type: (item.type === 'dir' ? 'dir' : 'file') as 'dir' | 'file',
        sha: item.sha
      }))
      .sort((a: DocItem, b: DocItem) => {
        if (a.type === 'dir' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });

    setCacheValue(dirCache, cacheKey, items, DIR_CACHE_TTL_MS);
    return { data: items, fromCache: false, staleFallback: false };
  } catch (err: unknown) {
    const staleCached = getAnyCacheValue(dirCache, cacheKey);
    if (staleCached) {
      return { data: staleCached, fromCache: true, staleFallback: true };
    }

    const trans = t();
    const errorMessage = err instanceof Error ? err.message : String(err);
    const axiosErr = err as { response?: { status?: number; headers?: Record<string, string> } };
    if (axiosErr.response?.status === 403) {
      const rateLimitRemaining = axiosErr.response.headers?.['x-ratelimit-remaining'];
      const rateLimitReset = axiosErr.response.headers?.['x-ratelimit-reset'];
      if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetDate = new Date(Number.parseInt(rateLimitReset, 10) * 1000);
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
    const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': `NBTCA-CLI/${APP_INFO.version}` } });
    const content = String(response.data);
    setCacheValue(fileCache, path, content, FILE_CACHE_TTL_MS);
    return { data: content, fromCache: false, staleFallback: false };
  } catch (err: unknown) {
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

function cleanMarkdownContent(content: string, type: TerminalType = getTerminalType()): string {
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

function extractDocTitle(rawContent: string, cleanedContent: string): string | null {
  // 1. Try YAML frontmatter title: field (before it was stripped)
  const fmMatch = rawContent.match(/^---\n[\s\S]*?\n---/m);
  if (fmMatch) {
    const titleMatch = fmMatch[0].match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    if (titleMatch?.[1]) return titleMatch[1].trim();
  }
  // 2. Fallback to first # H1 heading in cleaned content
  const h1Match = cleanedContent.match(/^#\s+(.+)$/m);
  return h1Match?.[1]?.trim() ?? null;
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

async function browseDirectory(initialPath: string = ''): Promise<void> {
  let currentPath = initialPath;

  while (true) {
    const trans = t();
    let items: DocItem[];
    try {
      const s = createSpinner(currentPath ? `${trans.docs.loadingDir}: ${currentPath}` : trans.docs.loading);
      const result = await fetchGitHubDirectory(currentPath);
      items = result.data;
      s.stop(currentPath || trans.docs.chooseDoc);

      if (result.staleFallback) {
        warning(trans.docs.usingCachedData);
      }
    } catch (err: unknown) {
      error(trans.docs.loadError);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(chalk.gray(`  ${trans.docs.errorHint}: ${errMsg}`));

      setVimKeysActive(false);
      const retry = await confirm({ message: trans.docs.retry });
      setVimKeysActive(true);
      if (!isCancel(retry) && retry) continue;
      return;
    }

    if (items.length === 0) {
      warning(trans.docs.emptyDir);
      if (currentPath) {
        currentPath = currentPath.split('/').slice(0, -1).join('/');
        continue;
      }
      return;
    }

    const options = [
      ...(currentPath ? [{ value: '__back__', label: chalk.dim(trans.docs.upToParent) }] : []),
      ...items.map(item => ({
        value: item.path,
        label: item.type === 'dir'
          ? chalk.cyan(`${item.name}/`)
          : item.name,
        hint: item.type === 'dir' ? 'dir' : undefined,
      })),
      { value: '__exit__', label: chalk.dim(trans.docs.returnToMenu) },
    ];

    const selected = await select({
      message: currentPath ? `${trans.docs.currentDir}: ${currentPath}` : trans.docs.chooseDoc,
      options,
    });

    if (isCancel(selected) || selected === '__exit__') return;

    if (selected === '__back__') {
      currentPath = currentPath.split('/').slice(0, -1).join('/');
      continue;
    }

    const item = items.find(i => i.path === selected);
    if (item?.type === 'dir') {
      currentPath = selected;
      continue;
    }
    if (item?.type === 'file') {
      await viewMarkdownFile(selected);
    }
  }
}

// ─── Document viewer ──────────────────────────────────────────────────────────

async function viewMarkdownFile(filePath: string): Promise<void> {
  const trans = t();

  while (true) {
    try {
      ensureMarkedConfigured();
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
        const cleaned = cleanMarkdownContent(rawContent, getTerminalType());
        const title = extractDocTitle(rawContent, cleaned) || filePath.split('/').pop() || filePath;
        const readTime = estimateReadTime(cleaned);
        const rendered = await marked(cleaned) as string;
        renderedDoc = { fingerprint, cleaned, rendered, title, readTime };
        setCacheValue(renderCache, filePath, renderedDoc, RENDER_CACHE_TTL_MS);
      }

      s.stop(`${chalk.bold(renderedDoc.title)}  ${chalk.dim(renderedDoc.readTime)}`);

      if (hasGlow()) {
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
          { value: 'back',    label: trans.docs.backToList },
          { value: 'reread',  label: trans.docs.reread },
          { value: 'browser', label: trans.docs.openBrowser },
        ],
      });

      if (isCancel(action) || action === 'back') return;
      if (action === 'browser') {
        await openDocsInBrowser(filePath);
        return;
      }
      // action === 'reread' → continue loop
    } catch (err: unknown) {
      error(trans.docs.loadError);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(chalk.gray(`  ${trans.docs.errorHint}: ${errMsg}`));

      setVimKeysActive(false);
      const openBrowser = await confirm({ message: trans.docs.openBrowserPrompt });
      setVimKeysActive(true);
      if (!isCancel(openBrowser) && openBrowser) {
        await openDocsInBrowser(filePath);
      }
      return;
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

// ─── Search ────────────────────────────────────────────────────────────────────

async function searchDocs(): Promise<void> {
  const trans = t();
  setVimKeysActive(false);
  const query = await text({
    message: trans.docs.searchPrompt,
    placeholder: trans.docs.searchPlaceholder,
  });
  setVimKeysActive(true);

  if (isCancel(query) || !query.trim()) return;

  const keyword = query.trim().toLowerCase();
  const s = createSpinner(trans.docs.searching);

  // Fetch all category directories in parallel
  const categories = getDocCategories().filter(c => c.path !== 'README.md');
  const results: { name: string; path: string; category: string }[] = [];

  try {
    const fetches = await Promise.allSettled(
      categories.map(async cat => {
        const res = await fetchGitHubDirectory(cat.path);
        return { items: res.data, category: cat.name };
      })
    );

    for (const result of fetches) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value.items) {
        const nameLC = item.name.toLowerCase();
        if (nameLC.includes(keyword)) {
          results.push({ name: item.name, path: item.path, category: result.value.category });
        }
      }
    }

    s.stop(`${results.length} ${trans.docs.searchResults}`);
  } catch {
    s.error(trans.docs.loadError);
    return;
  }

  if (results.length === 0) {
    warning(trans.docs.searchNoResults);
    return;
  }

  const selected = await select({
    message: trans.docs.chooseDoc,
    options: [
      ...results.map(r => ({
        value: r.path,
        label: r.name,
        hint: r.category,
      })),
      { value: '__back__', label: chalk.dim(trans.docs.returnToMenu) },
    ],
  });

  if (isCancel(selected) || selected === '__back__') return;

  await viewMarkdownFile(selected);
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function showDocsMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const categories = getDocCategories();
    const options = [
      ...categories.map(cat => ({ value: cat.path, label: cat.name })),
      { value: 'search', label: chalk.dim(trans.docs.searchPrompt.replace(':', '')) },
      { value: 'refresh-cache', label: chalk.dim(trans.docs.refreshCache) },
      { value: 'browser', label: chalk.dim(trans.docs.openBrowser) },
      { value: 'back',    label: chalk.dim(trans.docs.returnToMenu) },
    ];

    const action = await select({
      message: trans.docs.chooseCategory,
      options,
    });

    if (isCancel(action) || action === 'back') return;

    if (action === 'search') {
      await searchDocs();
    } else if (action === 'refresh-cache') {
      clearDocsCache();
      success(trans.docs.cacheCleared);
    } else if (action === 'browser') {
      await openDocsInBrowser();
    } else {
      await browseDirectory(action);
    }
  }
}
