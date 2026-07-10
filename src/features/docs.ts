import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import open from 'open';
import { runMenu } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { runConfirm } from '../core/components/confirm.js';
import { glyph } from '../core/theme.js';
import { error, warning, createSpinner } from '../core/ui.js';
import { pickIcon } from '../core/icons.js';
import { spawn, execFileSync } from 'child_process';
import { URLS } from '../config/data.js';
import { t, fmt } from '../i18n/index.js';
import { createDocsClient } from '@nbtca/docs';
import type { DocItem } from '@nbtca/docs';

function menuFooter(): string {
  const trans = t();
  return `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;
}

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
    const check = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(check, [cmd], { stdio: 'ignore' });
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
  marked.use(markedTerminal(getRendererOptions(getTerminalType())));
}

// ─── marked-terminal renderer ─────────────────────────────────────────────────

function getRendererOptions(type: TerminalType): Record<string, unknown> {
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
    firstHeading: chalk.bold.cyan,
    heading: chalk.bold.white,
    codespan: chalk.yellowBright,
    code: chalk.yellow,
    blockquote: chalk.italic.gray,
    strong: chalk.bold,
    em: chalk.italic,
    del: chalk.dim.strikethrough,
    link: chalk.cyan,
    href: chalk.cyan.underline,
    tableOptions: {
      chars: type === 'basic' ? asciiTableChars : unicodeTableChars
    }
  };
}


// ─── Data layer ───────────────────────────────────────────────────────────────

interface RenderedDoc {
  fingerprint: string;
  cleaned: string;
  rendered: string;
  title: string;
  readTime: string;
}

interface CacheEntry<T> { value: T; expiresAt: number }

const RENDER_CACHE_TTL_MS = 10 * 60 * 1000;
const RENDER_CACHE_MAX = 50;
const renderCache = new Map<string, CacheEntry<RenderedDoc>>();

let docsClient = createDocsClient();

function getFreshRender(key: string): RenderedDoc | null {
  const entry = renderCache.get(key);
  return entry && entry.expiresAt > Date.now() ? entry.value : null;
}

function setRender(key: string, value: RenderedDoc): void {
  renderCache.set(key, { value, expiresAt: Date.now() + RENDER_CACHE_TTL_MS });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = [...renderCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) renderCache.delete(oldest[0]);
  }
}

function contentFingerprint(content: string): string {
  return `${content.length}:${content.slice(0, 80)}:${content.slice(-80)}`;
}

export function clearDocsCache(): void {
  docsClient.clear();
  renderCache.clear();
}

async function fetchFileContent(path: string): Promise<string> {
  try {
    return await docsClient.getFile(path);
  } catch (err) {
    const trans = t();
    throw new Error(fmt(trans.docs.fetchFileFailed, { error: String(err) }));
  }
}

// ─── Content cleaning ─────────────────────────────────────────────────────────

/**
 * Line-by-line scanner that processes fenced code blocks before marked sees them:
 * - mermaid blocks → styled blockquote placeholder with diagram type
 * - other blocks with a language tag → prepend an inline-code label line
 */
function processFencedCodeBlocks(content: string): string {
  const trans = t();
  const lines = content.split('\n');
  const result: string[] = [];
  let inBlock = false;
  let fence = '';
  let blockLang = '';
  let blockBody: string[] = [];

  for (const line of lines) {
    if (!inBlock) {
      // Accept VitePress code meta after language: ```js{1,3} or ```ts [file.ts] :line-numbers
      const m = line.match(/^(`{3,})(\w+)?[^`\n]*$/);
      if (m) {
        inBlock   = true;
        fence     = m[1]!;
        blockLang = (m[2] ?? '').toLowerCase();
        blockBody = [];
      } else {
        result.push(line);
      }
    } else {
      if (line.startsWith(fence) && /^`+\s*$/.test(line)) {
        inBlock = false;
        const body = blockBody.join('\n');

        if (blockLang === 'mermaid') {
          // Skip %%{ init: ... }%% config directives to find the actual diagram type
          const meaningfulLine = body.trim().split('\n')
            .find(l => !l.trimStart().startsWith('%%') && l.trim()) ?? '';
          const firstToken = meaningfulLine.trim().split(/\s+/)[0] ?? 'diagram';
          const icon = pickIcon('📊', '[diagram]');
          result.push(`> ${icon} **${firstToken}** — _${trans.docs.mermaidHint}_`);
        } else {
          if (blockLang) result.push(`\`${blockLang}\``);
          result.push(fence);
          result.push(...blockBody);
          result.push(fence);
        }
      } else {
        blockBody.push(line);
      }
    }
  }

  if (inBlock) {
    result.push(`${fence}${blockLang}`);
    result.push(...blockBody);
  }

  return result.join('\n');
}

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

  // 1.5. Fenced code blocks: mermaid → placeholder, other langs → label prefix
  c = processFencedCodeBlocks(c);

  // 2. VitePress script / style blocks
  c = c.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  c = c.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // 3. VitePress containers → blockquote with icon
  c = c.replace(
    /^:::\s*(info|tip|warning|danger|details)\s*(.*?)\n([\s\S]*?)^:::\s*$/gm,
    (_m, type: string, title: string, body: string) => {
      const label = (title.trim() || type.charAt(0).toUpperCase() + type.slice(1));
      const icon = pickIcon(CONTAINER_ICONS_UNICODE[type] ?? '', CONTAINER_ICONS_ASCII[type] ?? '');
      const quoted = body.trimEnd().split('\n').map(l => `> ${l}`).join('\n');
      return `> ${icon} **${label}**\n>\n${quoted}\n`;
    }
  );
  c = c.replace(/^:::\s*\w*.*$/gm, '');

  // 4. GitHub / GitLab callout alerts  (> [!NOTE])
  c = c.replace(/^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/gim,
    (_, type: string) => `> **${type.charAt(0) + type.slice(1).toLowerCase()}:**`
  );

  // 5. [[toc]] — no value in terminal
  c = c.replace(/\[\[toc\]\]/gi, '');

  // 5.5. VitePress heading anchors {#custom-id} — no value in terminal
  c = c.replace(/^(#{1,6}\s+[^\n]*?)\s*\{#[^}]+\}\s*$/gm, '$1');

  // 5.6. ==highlight== → bold (VitePress extended syntax)
  c = c.replace(/==([^=\n]+)==/g, '**$1**');

  // 6. Images — adapt to terminal capability
  if (type === 'basic') {
    c = c.replace(
      /!\[([^\]]*)\]\([^)]+\)/g,
      (_, alt) => `${pickIcon('📎', '[image]')} ${alt || 'image'}`
    );
  } else {
    c = c.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const filename = (url as string).split('/').pop() || url;
      return `${pickIcon('🖼️', '[image]')} **${alt || 'image'}** _(${filename})_`;
    });
  }

  // 7. HTML comments
  c = c.replace(/<!--[\s\S]*?-->/g, '');

  // 8. Strip HTML tags, keep inner text
  c = c.replace(/<br\s*\/?>/gi, '\n');                                   // void: line break
  c = c.replace(/<(?:hr|input|link|meta)\b[^>]*\/?>/gi, '');            // void: discard
  c = c.replace(/<([a-z][a-z0-9]*)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2');
  c = c.replace(/<[a-z][a-z0-9]*\b[^>]*\/>/gi, '');

  // 8.5. Task list checkboxes
  c = c.replace(/^(\s*[-*+] )\[x\] /gim, '$1☑ ');
  c = c.replace(/^(\s*[-*+] )\[ \] /gm,  '$1☐ ');

  // 9. Collapse runs of 3+ blank lines
  c = c.replace(/\n{3,}/g, '\n\n');

  return c.trim();
}

function extractDocTitle(rawContent: string, cleanedContent: string): string | null {
  const fmMatch = rawContent.match(/^---\n[\s\S]*?\n---/m);
  if (fmMatch) {
    const titleMatch = fmMatch[0].match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    if (titleMatch?.[1]) return titleMatch[1].trim();
  }
  const h1Match = cleanedContent.match(/^#\s+(.+)$/m);
  return h1Match?.[1]?.trim() ?? null;
}

/** Approximate reading time: ~200 words/min for technical Chinese/English prose. */
function estimateReadTime(text: string): string {
  const cjkChars = (text.match(/[㐀-鿿]/g) || []).length;
  const nonCjk = text.replace(/[㐀-鿿]/g, ' ');
  const words = nonCjk.trim().split(/\s+/).filter(Boolean).length;
  const units = words + cjkChars / 2;
  const mins = Math.max(1, Math.ceil(units / 220));
  return mins === 1 ? '~1 min' : `~${mins} min`;
}

/** Extract h2/h3 headings for TOC display (skips the h1 title). */
function extractTOC(content: string): string[] {
  const lines = content.split('\n').filter(l => /^#{2,3}\s/.test(l));
  return lines.map(l => {
    const m = l.match(/^(#+)/);
    const level = m?.[1]?.length ?? 2;
    const text = l.replace(/^#+\s+/, '').trim();
    return (level === 3 ? '  ' : '') + text;
  });
}

/** True if the markdown source contains a pipe table. */
function hasMarkdownTable(content: string): boolean {
  return /^\|.+\|/m.test(content) && /^\|[-: |]+\|/m.test(content);
}

/** True if the markdown source contains a mermaid diagram block. */
function hasMermaidBlock(content: string): boolean {
  return /^```mermaid\b/m.test(content);
}

// ─── Document tree ────────────────────────────────────────────────────────────

const TOP_SECTION_ORDER = ['tutorial', 'process', 'repair', 'archived'];
const TOP_SECTION_SKIP = new Set(['docs', 'index.md', 'README.md']);

interface DocSection {
  key: string;
  label: string;
  count: number;
  files: DocItem[];
}

/**
 * Convert a kebab-case filename to a display-friendly title.
 * Preserves Chinese characters and date prefixes.
 */
function cleanFileName(name: string): string {
  const base = name.replace(/\.md$/, '');
  if (/^[\d.]/.test(base)) return base;
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Group flat DocItem list into top-level sections. */
function buildSections(all: DocItem[]): DocSection[] {
  const trans = t();
  const labelMap: Record<string, string> = {
    tutorial: trans.docs.categoryTutorial,
    process:  trans.docs.categoryProcess,
    repair:   trans.docs.categoryRepair,
    archived: trans.docs.categoryArchived,
  };

  const groups = new Map<string, DocItem[]>();
  for (const item of all) {
    const parts = item.path.split('/');
    if (parts.length < 2) continue;
    const top = parts[0]!;
    if (TOP_SECTION_SKIP.has(top)) continue;
    if (!TOP_SECTION_ORDER.includes(top)) continue;
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(item);
  }

  return TOP_SECTION_ORDER
    .filter(k => groups.has(k))
    .map(k => ({
      key:   k,
      label: labelMap[k] ?? k,
      count: groups.get(k)!.length,
      files: groups.get(k)!,
    }));
}

/** Group archived files by their second path component (year / manual / etc.). */
function getArchivedGroups(files: DocItem[]): Map<string, DocItem[]> {
  const groups = new Map<string, DocItem[]>();
  for (const item of files) {
    const group = item.path.split('/')[1] ?? 'other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  return groups;
}

async function loadSections(): Promise<DocSection[] | null> {
  const trans = t();
  const s = createSpinner(trans.docs.loading);
  try {
    const all = await docsClient.listAll();
    const sections = buildSections(all);
    s.stop();
    return sections;
  } catch {
    s.error(trans.docs.loadError);
    return null;
  }
}

// ─── Pager layer ──────────────────────────────────────────────────────────────

async function displayWithGlow(cleanedMarkdown: string): Promise<void> {
  const cols = String(Math.min(process.stdout.columns || 80, 80));
  return new Promise(resolve => {
    const child = spawn('glow', ['--pager', '--width', cols, '-'], {
      stdio: ['pipe', 'inherit', 'inherit']
    });
    child.stdin.write(cleanedMarkdown, 'utf-8');
    child.stdin.end();
    child.on('close', resolve);
    child.on('error', resolve);
  });
}

async function displayWithLess(
  rendered: string,
  title: string,
  filePath: string,
  readTime: string,
  toc: string[],
): Promise<void> {
  const trans = t();
  const cols = Math.min(process.stdout.columns || 80, 80);
  const rule = chalk.dim('─'.repeat(cols));

  const tocBlock = toc.length >= 3
    ? [
        chalk.dim(`  ${trans.docs.tocTitle}`),
        chalk.dim(`  ${'─'.repeat(36)}`),
        ...toc.map(h => chalk.dim(`  ${h}`)),
        chalk.dim(`  ${'─'.repeat(36)}`),
        '',
      ].join('\n')
    : '';

  const header = [
    '',
    chalk.bold.cyan(`  ${title}`),
    chalk.dim(`  ${filePath}`) + chalk.dim(`  ·  ${readTime}`),
    rule,
    ...(tocBlock ? [tocBlock] : []),
    '',
  ].join('\n');

  const footer = [
    '',
    rule,
    chalk.dim(`  ${trans.docs.endOfDocument}`),
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

// ─── Section browsers ─────────────────────────────────────────────────────────

/** Show a flat file list for tutorial / process / repair. */
async function showDocSection(section: DocSection): Promise<void> {
  const trans = t();

  if (section.key === 'archived') {
    await showArchivedSection(section.files);
    return;
  }

  const files = section.files.filter(f =>
    f.name !== 'index.md' && !f.name.startsWith('index.')
  );
  if (files.length === 0) return;

  const selected = await runMenu({
    title: section.label,
    options: [
      ...files.map(f => ({ value: f.path, label: cleanFileName(f.name) })),
      { value: '__back__', label: chalk.dim(trans.common.back) },
    ],
    footer: menuFooter(),
  });

  if (selected === null || selected === '__back__') return;
  await viewMarkdownFile(selected);
}

/** Show archived docs grouped by year, then files within the year. */
async function showArchivedSection(files: DocItem[]): Promise<void> {
  const trans = t();
  const groups = getArchivedGroups(files);

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const aYear = /^\d{4}$/.test(a);
    const bYear = /^\d{4}$/.test(b);
    if (aYear && bYear) return Number(b) - Number(a);
    if (aYear) return -1;
    if (bYear) return 1;
    return a.localeCompare(b);
  });

  const groupKey = await runMenu({
    title: trans.docs.categoryArchived,
    options: [
      ...sortedKeys.map(k => ({
        value: k,
        label: k,
        hint: String(groups.get(k)!.length),
      })),
      { value: '__back__', label: chalk.dim(trans.common.back) },
    ],
    footer: menuFooter(),
  });

  if (groupKey === null || groupKey === '__back__') return;

  const groupFiles = groups.get(groupKey) ?? [];
  const subDirs = new Set(groupFiles.map(f => f.path.split('/')[2]).filter(Boolean));
  const fileSelected = await runMenu({
    title: `${trans.docs.categoryArchived} · ${groupKey}`,
    options: [
      ...groupFiles.map(f => {
        const sub = f.path.split('/').slice(2, -1).join('/');
        return {
          value: f.path,
          label: cleanFileName(f.name),
          hint: subDirs.size > 1 ? sub : undefined,
        };
      }),
      { value: '__back__', label: chalk.dim(trans.common.back) },
    ],
    footer: menuFooter(),
  });

  if (fileSelected === null || fileSelected === '__back__') return;
  await viewMarkdownFile(fileSelected);
}

// ─── Document viewer ──────────────────────────────────────────────────────────

async function viewMarkdownFile(filePath: string): Promise<void> {
  const trans = t();
  try {
    ensureMarkedConfigured();
    const s = createSpinner(`${trans.docs.loadingFile}: ${filePath}`);

    const rawContent = await fetchFileContent(filePath);
    const fingerprint = contentFingerprint(rawContent);
    const cachedRendered = getFreshRender(filePath);

    let renderedDoc: RenderedDoc;
    if (cachedRendered && cachedRendered.fingerprint === fingerprint) {
      renderedDoc = cachedRendered;
    } else {
      const cleaned = cleanMarkdownContent(rawContent, getTerminalType());
      const title = extractDocTitle(rawContent, cleaned) || cleanFileName(filePath.split('/').pop() ?? filePath);
      const readTime = estimateReadTime(cleaned);
      const rendered = await marked(cleaned) as string;
      renderedDoc = { fingerprint, cleaned, rendered, title, readTime };
      setRender(filePath, renderedDoc);
    }

    s.stop(`${chalk.bold(renderedDoc.title)}  ${chalk.dim(renderedDoc.readTime)}`);

    const toc = extractTOC(renderedDoc.cleaned);
    if (hasGlow()) {
      await displayWithGlow(renderedDoc.cleaned);
    } else {
      await displayWithLess(renderedDoc.rendered, renderedDoc.title, filePath, renderedDoc.readTime, toc);
    }

    const needsBrowser = hasMarkdownTable(rawContent) || hasMermaidBlock(rawContent);
    const action = await runMenu({
      title: trans.docs.chooseAction,
      options: [
        { value: 'back',    label: trans.docs.backToList },
        { value: 'browser', label: trans.docs.openBrowser,
          hint: needsBrowser ? trans.docs.tableHint : undefined },
      ],
      footer: menuFooter(),
    });

    if (action === 'browser') {
      await openDocsInBrowser(filePath);
    }
  } catch (err: unknown) {
    error(trans.docs.loadError);
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${errMsg}`));

    const openBrowser = await runConfirm({ message: trans.docs.openBrowserPrompt });
    if (openBrowser === true) {
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

// ─── Search ────────────────────────────────────────────────────────────────────

async function searchDocs(): Promise<void> {
  const trans = t();
  const query = await runTextInput({
    message: trans.docs.searchPrompt,
    placeholder: trans.docs.searchPlaceholder,
  });

  if (query === null || !query.trim()) return;

  const keyword = query.trim().toLowerCase();
  const s = createSpinner(trans.docs.searching);

  try {
    const all = await docsClient.listAll();
    const results = all.filter(item =>
      item.path.toLowerCase().includes(keyword)
    );

    s.stop(`${results.length} ${trans.docs.searchResults}`);

    if (results.length === 0) {
      warning(trans.docs.searchNoResults);
      return;
    }

    const selected = await runMenu({
      title: trans.docs.chooseDoc,
      options: [
        ...results.map(r => ({
          value: r.path,
          label: cleanFileName(r.name),
          hint: r.path.includes('/') ? r.path.split('/').slice(0, -1).join('/') : '',
        })),
        { value: '__back__', label: chalk.dim(trans.docs.returnToMenu) },
      ],
      footer: menuFooter(),
    });

    if (selected === null || selected === '__back__') return;
    await viewMarkdownFile(selected);
  } catch {
    s.error(trans.docs.loadError);
  }
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function showDocsMenu(): Promise<void> {
  let sections = await loadSections();
  if (!sections) return;

  while (true) {
    const trans = t();
    const action = await runMenu({
      title: trans.docs.chooseCategory,
      options: [
        ...sections.map(sec => ({ value: sec.key, label: sec.label })),
        { value: 'search',  label: chalk.dim(trans.docs.searchPrompt.replace(':', '')) },
        { value: 'browser', label: chalk.dim(trans.docs.openBrowser) },
      ],
      footer: menuFooter(),
    });

    if (action === null) return;

    if (action === 'search') {
      await searchDocs();
    } else if (action === 'browser') {
      await openDocsInBrowser();
    } else {
      const section = sections.find(s => s.key === action);
      if (section) await showDocSection(section);
    }
  }
}
