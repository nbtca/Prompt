import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import open from 'open';
import { runMenu, menuFooter } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { runConfirm } from '../core/components/confirm.js';
import { warning, createSpinner } from '../core/ui.js';
import { pickIcon } from '../core/icons.js';
import { spawn, execFileSync } from 'child_process';
import { URLS } from '../config/data.js';
import { t, fmt, type Translations } from '../i18n/index.js';
import { enterScreen, breadcrumb } from '../core/transitions.js';
import { createDocsClient } from '@nbtca/docs';
import type { DocItem } from '@nbtca/docs';

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

// nbtca/documents links internally with relative/root-relative paths
// (`./what-is-nbtca`, `/concepts/school`) that only resolve in a browser --
// a terminal pager can neither follow nor hover-preview them, so showing
// the path is dead weight. Matches './x', '../x', and '/x' but not a bare
// '/' (an internal href is never *just* a slash in this content).
function isInternalHref(href: string): boolean {
  return /^\.{0,2}\/./.test(href);
}

let _markedConfigured = false;
export function ensureMarkedConfigured(): void {
  if (_markedConfigured) return;
  _markedConfigured = true;
  const extension = markedTerminal(getRendererOptions(getTerminalType()));
  const renderer = extension.renderer ?? (extension.renderer = {});

  const renderExternalLink = renderer.link;
  if (renderExternalLink) {
    renderer.link = function (token) {
      if (isInternalHref(token.href)) return chalk.cyan.underline(token.text);
      return renderExternalLink.call(this, token);
    };
  }

  // marked-terminal's own `text` renderer always uses the token's raw
  // `.text` string, never `.tokens` -- fine for a plain text run, but a
  // *tight* list item (nbtca/documents' convention throughout: no blank
  // line between "- " entries) tokenizes its content as a `text` token
  // with markdown links inside still sitting unparsed in `.tokens`, not
  // resolved into `.text`. Result: every link inside every bullet list
  // rendered as completely raw, un-clickable-looking `[text](url)` syntax
  // (only paragraph-level links, which *do* go through inline-parsing,
  // picked up the `link` override above at all). Recursing into
  // `parser.parseInline` here when `.tokens` exists routes list-item links
  // through the same override, matching how paragraph/heading already do.
  const renderPlainText = renderer.text;
  if (renderPlainText) {
    renderer.text = function (token) {
      const withTokens = token as typeof token & { tokens?: unknown[] };
      if (Array.isArray(withTokens.tokens) && withTokens.tokens.length > 0) {
        return (this as { parser: { parseInline: (t: unknown[]) => string } })
          .parser.parseInline(withTokens.tokens);
      }
      return renderPlainText.call(this, token);
    };
  }

  marked.use(extension);
}

// ─── marked-terminal renderer ─────────────────────────────────────────────────

function getRendererOptions(type: TerminalType): Record<string, unknown> {
  const width = 80;

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
    // marked-terminal defaults this to true, prefixing every heading with
    // its literal '#'/'##'/etc. markdown syntax. displayWithLess() already
    // prints its own clean title line above the content, and most docs'
    // first line is an H1 matching that same title -- so the raw '#
    // Title' immediately below just repeated it a second time, syntax
    // marks and all. firstHeading/heading's bold+color already
    // distinguishes heading levels without the extra prefix.
    showSectionPrefix: false,
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

export function cleanMarkdownContent(content: string, type: TerminalType = getTerminalType()): string {
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

  // Internal wiki links (./foo, /concepts/foo) are handled at the renderer
  // level (ensureMarkedConfigured's link override below), not here -- an
  // earlier version of this rewrote link syntax into pre-colored raw ANSI
  // text before marked() ever saw it, which broke when marked-terminal's
  // own text reflow/wrapping ran on top of already-escaped text, corrupting
  // the escape sequences into literal visible "[36m...[24m" garbage.
  // Overriding the renderer instead lets marked-terminal own all ANSI
  // output, so nothing downstream can mangle it.

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

// ─── In-app reader (link-following, no shell-out to less/glow) ────────────────

export interface DocLink { href: string; text: string }

/** Every internal ([text](href) where isInternalHref(href)) link in a
 * document, in reading order, raw href not yet resolved to a real path. */
function extractInternalLinks(markdown: string): DocLink[] {
  const links: DocLink[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const href = m[2] ?? '';
    if (isInternalHref(href)) links.push({ text: m[1] ?? '', href });
  }
  return links;
}

/** Resolves a wiki-style href (relative to the *linking* document, VitePress
 * conventions: no .md extension, trailing '/' means that dir's index) into
 * a real repo-relative path matching DocItem.path -- e.g. './what-is-nbtca'
 * from within 'about/index.md' -> 'about/what-is-nbtca.md'; '/concepts/'
 * (root-relative, works from anywhere) -> 'concepts/index.md'. */
function resolveInternalHref(href: string, fromPath: string): string {
  const fromDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const combined = href.startsWith('/') ? href.slice(1) : (fromDir ? `${fromDir}/${href}` : href);
  const stack: string[] = [];
  for (const part of combined.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { stack.pop(); continue; }
    stack.push(part);
  }
  let target = stack.join('/');
  if (target === '' || href.endsWith('/')) target += (target ? '/' : '') + 'index';
  if (!target.endsWith('.md')) target += '.md';
  return target;
}

export interface ReaderDoc {
  path: string;
  title: string;
  lines: string[];
  links: DocLink[]; // .href here is already resolved to a real DocItem.path
}

/** Loads and renders a doc for the native in-app reader -- the same
 * fetch/clean/render/cache pipeline viewMarkdownFile uses, minus the
 * spinner/pager/post-read menu, which belong to the classic-pager
 * presentation layer, not this one. */
export async function loadDocForReader(filePath: string): Promise<ReaderDoc> {
  ensureMarkedConfigured();
  const rawContent = await fetchFileContent(filePath);
  const fingerprint = contentFingerprint(rawContent);
  const cached = getFreshRender(filePath);

  let renderedDoc: RenderedDoc;
  if (cached && cached.fingerprint === fingerprint) {
    renderedDoc = cached;
  } else {
    const cleaned = cleanMarkdownContent(rawContent, getTerminalType());
    const title = extractDocTitle(rawContent, cleaned) || cleanFileName(filePath.split('/').pop() ?? filePath);
    const readTime = estimateReadTime(cleaned);
    const rendered = await marked(cleaned) as string;
    renderedDoc = { fingerprint, cleaned, rendered, title, readTime };
    setRender(filePath, renderedDoc);
  }

  const seen = new Set<string>();
  const links: DocLink[] = [];
  for (const raw of extractInternalLinks(renderedDoc.cleaned)) {
    const resolved = resolveInternalHref(raw.href, filePath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    links.push({ text: raw.text, href: resolved });
  }

  return { path: filePath, title: renderedDoc.title, lines: renderedDoc.rendered.split('\n'), links };
}

// ─── Document tree ────────────────────────────────────────────────────────────

// Sourced from a live audit of nbtca/documents (2026-07-18): `about` and
// `concepts` are two whole new top-level sections added in the repo's wiki
// reconstruction (5abcc4d, 5beee27) -- omitted here, buildSections() below
// silently drops every file under them, which is exactly what happened
// before this fix caught up to the upstream restructuring. `about` leads
// (org intro for newcomers) and `concepts` sits after the practical guide
// as reference material.
const TOP_SECTION_ORDER = ['about', 'guide', 'repair', 'concepts', 'archived'];
const TOP_SECTION_SKIP = new Set(['docs', 'index.md', 'README.md']);
// tutorial/ and process/ are two folders on disk but one section everywhere
// a reader actually sees them: nbtca/documents' own site nav collapses both
// under a single "指南/Guide" entry, and tutorial/sidebar.ts spells out why
// ("「指南」= 教程（学技术）+流程（办社务）高内聚合并为一栏") -- presenting
// them as two separate top-level categories in the terminal was true to the
// folder layout but false to how the content is actually meant to be read.
const SECTION_ALIAS: Readonly<Record<string, string>> = { tutorial: 'guide', process: 'guide' };

export interface DocSection {
  key: string;
  label: string;
  count: number;
  files: DocItem[];
}

export function localizeDocSections(sections: readonly DocSection[], trans: Translations = t()): DocSection[] {
  const labels: Record<string, string> = {
    about: trans.docs.categoryAbout,
    guide: trans.docs.categoryGuide,
    repair: trans.docs.categoryRepair,
    concepts: trans.docs.categoryConcepts,
    archived: trans.docs.categoryArchived,
  };
  return sections.map((section) => ({ ...section, label: labels[section.key] ?? section.label }));
}

/**
 * Convert a kebab-case filename to a display-friendly title.
 * Preserves Chinese characters and date prefixes.
 */
export function cleanFileName(name: string): string {
  const base = name.replace(/\.md$/, '');
  if (/^[\d.]/.test(base)) return base;
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Real titles (each document's own top-level `# heading`) for the
 * curated tutorial/process/repair sections, keyed by repo-relative path.
 * These are hand-authored English-filename docs with Chinese content —
 * mechanically title-casing the filename ("Clean Drive C") reads as a
 * different, lower-quality product than the document's own title ("C盘
 * 清理标准化流程"). Deliberately scoped to these three sections only:
 * `archived/`'s meeting notes are informal and often share the same
 * generic real heading across many different dates (e.g. five different
 * files all titled just "维修日") — there, the current filename-derived,
 * date-prefixed label is more useful for telling entries apart than the
 * real heading would be, so it is intentionally left as-is.
 *
 * Pulled from a live audit of the actual nbtca/documents content
 * (2026-07-16). A doc added later without an entry here simply falls
 * back to `cleanFileName` — never an error, never a blank label.
 */
const KNOWN_DOC_TITLES: Readonly<Record<string, string>> = {
  'tutorial/2025/clean-drive-c.md': 'C盘清理标准化流程',
  'tutorial/2025/edu-email.md': '教育邮箱用途',
  'tutorial/2025/github-education-verification.md': 'Github Education 认证指南',
  'tutorial/2025/github-workflow.md': '快速上手社团目前的Github工作流',
  'tutorial/2025/google-calendar.md': '谷歌日历使用指南',
  'tutorial/2025/nginx-usage.md': '快速上手你的nginx',
  'tutorial/2025/tailscale-usage.md': '社团自建 Tailscale 使用指南',
  'tutorial/manual/hardware-establish.md': '计算机硬件系统的搭建与维护',
  'tutorial/manual/net-usage.md': '国际互联网的使用',
  'tutorial/manual/os-skills.md': '基础操作系统的使用技术',
  'tutorial/manual/windows-from-scratch.md': '从零开始安装 Windows',
  'process/2025/apply-for-credits.md': '申请第二课堂学分',
  'process/2025/borrow-classroom.md': '借教室',
  'process/2025/event-organization.md': '活动举办文档(待完善)',
  'process/2025/nbtca-post.md': '撰写并发布你的第一篇NBTCA博客',
  'process/2025/reimbursement-process.md': '报销流程',
  'repair/checklist.md': '维修日检查单',
  'repair/guide.md': '维修操作指南',
  'repair/repair-day.md': '维修日',
  'repair/tools.md': '软件仓库（校内镜像站）',
  'repair/weekend.md': '维修工单系统 (weekend)',
};

/** Display title for a tutorial/process/repair doc: the real, known title
 * when we have one, otherwise the same filename-derived fallback used
 * everywhere else (including for every archived/ doc, which never has a
 * known-title entry by design). */
export function displayDocTitle(path: string, name: string): string {
  return KNOWN_DOC_TITLES[path] ?? cleanFileName(name);
}

/** Group flat DocItem list into top-level sections. */
export function buildSections(all: DocItem[]): DocSection[] {
  const groups = new Map<string, DocItem[]>();
  for (const item of all) {
    const parts = item.path.split('/');
    if (parts.length < 2) continue;
    const rawTop = parts[0]!;
    if (TOP_SECTION_SKIP.has(rawTop)) continue;
    const top = SECTION_ALIAS[rawTop] ?? rawTop;
    if (!TOP_SECTION_ORDER.includes(top)) continue;
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(item);
  }

  return localizeDocSections(TOP_SECTION_ORDER
    .filter(k => groups.has(k))
    .map(k => ({
      key:   k,
      label: k,
      count: groups.get(k)!.length,
      files: groups.get(k)!,
    })));
}

/** Group archived files by their second path component (year / manual / etc.). */
export function getArchivedGroups(files: DocItem[]): Map<string, DocItem[]> {
  const groups = new Map<string, DocItem[]>();
  for (const item of files) {
    const group = item.path.split('/')[1] ?? 'other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  return groups;
}

/** Raw fetch, no spinner/UI — throws on failure. Shared by the classic and
 * native-view loaders. */
export async function fetchAllDocs(): Promise<DocItem[]> {
  return docsClient.listAll();
}

export async function fetchSections(): Promise<DocSection[]> {
  return buildSections(await fetchAllDocs());
}

async function loadSections(): Promise<DocSection[] | null> {
  const trans = t();
  const s = createSpinner(trans.docs.loading);
  try {
    const sections = await fetchSections();
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

export async function viewMarkdownFile(filePath: string): Promise<void> {
  const trans = t();
  ensureMarkedConfigured();
  const s = createSpinner(`${trans.docs.loadingFile}: ${filePath}`);
  try {
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
    s.error(trans.docs.loadError);
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
  await enterScreen(breadcrumb(t().menu.docs));
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
