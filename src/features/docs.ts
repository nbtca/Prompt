import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import { createHash } from 'node:crypto';
import { runMenu, menuFooter } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { runConfirm } from '../core/components/confirm.js';
import { warning, createSpinner } from '../core/ui.js';
import { pickIcon } from '../core/icons.js';
import { spawn, execFileSync } from 'child_process';
import { URLS } from '../config/data.js';
import { t, fmt, getCurrentLanguage, type Translations } from '../i18n/index.js';
import { enterScreen, breadcrumb } from '../core/transitions.js';
import { loadDocsIndex, saveDocsIndex } from './docs-store.js';
import { sanitizeTerminalLine, sanitizeTerminalText, stripAnsi, truncate } from '../core/text.js';
import { clearDocsClients, runDocsClientOperation } from './docs-client.js';
import { launchBrowserUrl } from './links.js';
import type { DocItem, DocPage, DocsSearchResult } from '@nbtca/docs';

type TerminalType = 'basic' | 'enhanced' | 'advanced';

function detectTerminalType(): TerminalType {
  const term = (process.env['TERM'] ?? '').toLowerCase();
  const termProgram = (process.env['TERM_PROGRAM'] ?? '').toLowerCase();

  const hasImages =
    termProgram.includes('iterm') ||
    term.includes('kitty') ||
    termProgram.includes('wezterm') ||
    term.includes('sixel');
  const hasColor =
    process.env['COLORTERM'] !== undefined ||
    term.includes('color') ||
    term.includes('256') ||
    term.includes('ansi') ||
    termProgram !== '';
  const hasUnicode =
    (process.env['LANG'] ?? '').includes('UTF-8') ||
    (process.env['LC_ALL'] ?? '').includes('UTF-8');

  if (hasImages && hasColor && hasUnicode) return 'advanced';
  if (hasColor && hasUnicode) return 'enhanced';
  return 'basic';
}

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
  _terminalType ??= detectTerminalType();
  return _terminalType;
}

let _hasGlow: boolean | null = null;
function hasGlow(): boolean {
  _hasGlow ??= commandExists('glow');
  return _hasGlow;
}

function isInternalHref(href: string): boolean {
  return /^\.{0,2}\/./.test(href);
}

let _markedConfigured = false;
export function ensureMarkedConfigured(): void {
  if (_markedConfigured) return;
  _markedConfigured = true;
  const terminalType = getTerminalType();
  const extension = markedTerminal(getRendererOptions(terminalType));
  const renderer = extension.renderer ?? (extension.renderer = {});

  const renderExternalLink = renderer.link;
  if (renderExternalLink) {
    renderer.link = function (token) {
      if (isInternalHref(token.href)) return chalk.cyan.underline(token.text);
      return renderExternalLink.call(this, token);
    };
  }

  const renderPlainText = renderer.text;
  if (renderPlainText) {
    renderer.text = function (token) {
      const withTokens = token as typeof token & { tokens?: unknown[] };
      if (Array.isArray(withTokens.tokens) && withTokens.tokens.length > 0) {
        return (this as { parser: { parseInline: (t: unknown[]) => string } }).parser.parseInline(
          withTokens.tokens,
        );
      }
      return renderPlainText.call(this, token);
    };
  }

  marked.use(extension);
}

function getRendererOptions(type: TerminalType): Record<string, unknown> {
  const width = 80;

  const unicodeTableChars = {
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
    middle: '│',
  };

  const asciiTableChars = {
    top: '-',
    'top-mid': '+',
    'top-left': '+',
    'top-right': '+',
    bottom: '-',
    'bottom-mid': '+',
    'bottom-left': '+',
    'bottom-right': '+',
    left: '|',
    'left-mid': '+',
    mid: '-',
    'mid-mid': '+',
    right: '|',
    'right-mid': '+',
    middle: '|',
  };

  return {
    width,
    emoji: true,
    unescape: true,
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
      chars: type === 'basic' ? asciiTableChars : unicodeTableChars,
    },
  };
}

interface RenderedDoc {
  fingerprint: string;
  cleaned: string;
  rendered: string;
  title: string;
  readTime: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const RENDER_CACHE_TTL_MS = 10 * 60 * 1000;
const RENDER_CACHE_MAX = 50;
const renderCache = new Map<string, CacheEntry<RenderedDoc>>();
const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const METADATA_CACHE_MAX = 200;
const METADATA_CONCURRENCY = 4;

interface DocMetadata {
  title: string;
  summary: string;
  route: string;
}

const metadataCache = new Map<string, CacheEntry<DocMetadata>>();
let cacheGeneration = 0;

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
  return createHash('sha256').update(content).digest('base64url');
}

function renderCacheKey(filePath: string): string {
  return [
    filePath,
    getCurrentLanguage(),
    getTerminalType(),
    pickIcon('unicode', 'ascii'),
    chalk.level,
  ].join('\0');
}

export function clearDocsCache(): void {
  cacheGeneration += 1;
  clearDocsClients();
  renderCache.clear();
  metadataCache.clear();
}

async function fetchDocument(path: string, signal?: AbortSignal): Promise<DocPage> {
  try {
    return await runDocsClientOperation(signal, (client) => client.getDocument(path));
  } catch (err) {
    const trans = t();
    throw new Error(fmt(trans.docs.fetchFileFailed, { error: sanitizeTerminalLine(String(err)) }));
  }
}

function metadataFromPage(page: DocPage): DocMetadata {
  return {
    title: sanitizeTerminalLine(page.title),
    summary: sanitizeTerminalLine(page.summary),
    route: page.route,
  };
}

function getFreshMetadata(path: string): DocMetadata | null {
  const entry = metadataCache.get(path);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    metadataCache.delete(path);
    return null;
  }
  metadataCache.delete(path);
  metadataCache.set(path, entry);
  return entry.value;
}

function setMetadata(path: string, value: DocMetadata): void {
  metadataCache.delete(path);
  metadataCache.set(path, { value, expiresAt: Date.now() + METADATA_CACHE_TTL_MS });
  if (metadataCache.size > METADATA_CACHE_MAX) {
    const oldest = metadataCache.keys().next().value;
    if (oldest) metadataCache.delete(oldest);
  }
}

function loadDocMetadata(path: string, signal?: AbortSignal): Promise<DocMetadata> {
  const cached = getFreshMetadata(path);
  if (cached) return Promise.resolve(cached);

  const generation = cacheGeneration;
  return fetchDocument(path, signal).then((page) => {
    const metadata = metadataFromPage(page);
    if (generation === cacheGeneration) setMetadata(path, metadata);
    return metadata;
  });
}

function normalizeRenderedTasks(content: string, type: TerminalType): string {
  if (type !== 'basic') return content;
  return content
    .split('\n')
    .map((line) =>
      /^\s*(?:[-*+]|\d+[.)])\s+\[X\](?:\s|$)/.test(stripAnsi(line))
        ? line.replace('[X]', '[x]')
        : line,
    )
    .join('\n');
}

async function loadRenderedDoc(
  filePath: string,
  signal?: AbortSignal,
): Promise<{
  rawContent: string;
  renderedDoc: RenderedDoc;
}> {
  const generation = cacheGeneration;
  const page = await fetchDocument(filePath, signal);
  if (generation === cacheGeneration) setMetadata(filePath, metadataFromPage(page));
  const rawContent = page.content;
  const fingerprint = contentFingerprint(rawContent);
  const cacheKey = renderCacheKey(filePath);
  const cached = getFreshRender(cacheKey);
  if (cached?.fingerprint === fingerprint) return { rawContent, renderedDoc: cached };

  const terminalType = getTerminalType();
  const cleaned = cleanMarkdownContent(rawContent, terminalType);
  const title =
    sanitizeTerminalLine(page.title) || cleanFileName(filePath.split('/').pop() ?? filePath);
  const markedOutput = normalizeRenderedTasks(await marked(cleaned), terminalType);
  const renderedDoc = {
    fingerprint,
    cleaned,
    rendered: chalk.level === 0 ? sanitizeTerminalText(markedOutput) : markedOutput,
    title,
    readTime: estimateReadTime(cleaned),
  };
  if (generation === cacheGeneration) setRender(cacheKey, renderedDoc);
  return { rawContent, renderedDoc };
}

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
      const m = /^(`{3,})(\w+)?[^`\n]*$/.exec(line);
      if (m) {
        const matchedFence = m[1];
        if (!matchedFence) {
          result.push(line);
          continue;
        }
        inBlock = true;
        fence = matchedFence;
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
          const meaningfulLine =
            body
              .trim()
              .split('\n')
              .find((l) => !l.trimStart().startsWith('%%') && l.trim()) ?? '';
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
  info: '[INFO]',
  tip: '[TIP]',
  warning: '[WARN]',
  danger: '[DANGER]',
  details: '[DETAIL]',
};
const CONTAINER_ICONS_UNICODE: Record<string, string> = {
  info: 'ℹ️',
  tip: '💡',
  warning: '⚠️',
  danger: '🚨',
  details: '▶️',
};

function componentAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /(?:^|\s)([:@\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const value = match[2] ?? match[3];
    if (name && value !== undefined) attributes.set(name, sanitizeTerminalLine(value));
  }
  return attributes;
}

function replaceDocumentComponents(content: string): string {
  let result = content;

  result = result.replace(/<PageHero\b([\s\S]*?)\/>/gi, (_match: string, source: string) => {
    const attributes = componentAttributes(source);
    const title = attributes.get('title');
    const lede = attributes.get('lede');
    return [title ? `# ${title}` : '', lede ?? ''].filter(Boolean).join('\n\n');
  });

  result = result.replace(/<LinkCard\b([\s\S]*?)\/>/gi, (_match: string, source: string) => {
    const attributes = componentAttributes(source);
    const href = attributes.get('href');
    const title = attributes.get('title');
    if (!href || !title) return '';
    const description = attributes.get('desc');
    return `- [${title}](${href})${description ? ` — ${description}` : ''}`;
  });

  result = result.replace(/<(?:Figure|Band)\b([\s\S]*?)\/>/gi, (_match: string, source: string) => {
    const attributes = componentAttributes(source);
    const src = attributes.get('src');
    if (!src) return '';
    const label = attributes.get('caption') ?? attributes.get('alt') ?? 'image';
    const details = [attributes.get('date'), attributes.get('source')].filter(Boolean).join(' · ');
    return `![${label}](${src})${details ? `\n\n_${details}_` : ''}`;
  });

  result = result.replace(/<Split\b([^>]*)>/gi, (_match: string, source: string) => {
    const heading = componentAttributes(source).get('heading');
    return heading ? `### ${heading}\n\n` : '';
  });

  result = result.replace(/<TimelineEntry\b([^>]*)>/gi, (_match: string, source: string) => {
    const attributes = componentAttributes(source);
    const heading = [attributes.get('year'), attributes.get('title')].filter(Boolean).join(' · ');
    return heading ? `### ${heading}\n\n` : '';
  });

  result = result.replace(/<FactStrip\b([\s\S]*?)\/>/gi, (_match: string, source: string) => {
    const facts = componentAttributes(source).get(':facts');
    if (!facts) return '';
    return [...facts.matchAll(/\{\s*label:\s*'([^']*)'\s*,\s*value:\s*'([^']*)'\s*\}/g)]
      .map((match) => `- **${match[1]}:** ${match[2]}`)
      .join('\n');
  });

  return result;
}

function replaceHtmlCheckboxes(content: string, type: TerminalType): string {
  return content.replace(/<input\b([^>]*)\/?\s*>/gi, (tag: string, attributes: string) => {
    const typeMatch = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>/]+))/i.exec(attributes);
    const inputType = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '')
      .trim()
      .toLowerCase();
    if (inputType !== 'checkbox') return tag;

    const checked = /(?:^|\s)checked(?=\s|=|\/|$)/i.test(attributes);
    if (type === 'basic') return checked ? '[x]' : '[ ]';
    return checked ? '☑' : '☐';
  });
}

function expandHtmlDetails(content: string): string {
  return content
    .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/gi, (_match: string, label: string) => {
      const summary = sanitizeTerminalLine(label);
      return summary ? `\n\n### ${summary}\n\n` : '\n';
    })
    .replace(/<\/?(?:details|summary)\b[^>]*>/gi, '');
}

function transformOutsideFencedCodeBlocks(
  content: string,
  transform: (value: string) => string,
): string {
  const output: string[] = [];
  let plain: string[] = [];
  let fenceCharacter = '';
  let fenceWidth = 0;
  let listIndent = 0;
  let listQuoteDepth = 0;

  const flushPlain = () => {
    if (plain.length === 0) return;
    output.push(transform(plain.join('\n')));
    plain = [];
  };

  const lineContext = (line: string): { quoteDepth: number; rest: string } => {
    let rest = line;
    let quoteDepth = 0;
    for (;;) {
      const quote = /^[ \t]{0,3}>[ \t]?/.exec(rest)?.[0];
      if (!quote) break;
      quoteDepth += 1;
      rest = rest.slice(quote.length);
    }
    return { quoteDepth, rest };
  };

  const fenceMarker = (line: string): string | undefined => {
    let { rest } = lineContext(line);
    const list = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.exec(rest)?.[0];
    if (list) rest = rest.slice(list.length);
    else if (listIndent > 0 && rest.startsWith(' '.repeat(listIndent))) {
      rest = rest.slice(listIndent);
    }
    return /^ {0,3}(`{3,}|~{3,})/.exec(rest)?.[1];
  };

  for (const line of content.split('\n')) {
    if (fenceWidth === 0) {
      const { quoteDepth, rest } = lineContext(line);
      const list = /^([ ]*)(?:[-+*]|\d+[.)])([ \t]+)/.exec(rest);
      if (list) {
        listIndent = list[0].length;
        listQuoteDepth = quoteDepth;
      } else if (rest.trim() && (quoteDepth !== listQuoteDepth || rest.search(/\S/) < listIndent)) {
        listIndent = 0;
        listQuoteDepth = quoteDepth;
      }
      const opening = fenceMarker(line);
      if (!opening) {
        plain.push(line);
        continue;
      }
      flushPlain();
      fenceCharacter = opening[0] ?? '';
      fenceWidth = opening.length;
      output.push(line);
      continue;
    }

    output.push(line);
    const closing = fenceMarker(line);
    const closingSuffix = closing ? line.slice(line.lastIndexOf(closing) + closing.length) : line;
    if (
      closing?.[0] === fenceCharacter &&
      closing.length >= fenceWidth &&
      closingSuffix.trim() === ''
    ) {
      fenceCharacter = '';
      fenceWidth = 0;
    }
  }
  flushPlain();
  return output.join('\n');
}

function cleanMarkdownOutsideFences(content: string, terminalType: TerminalType): string {
  let c = content;

  c = c.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  c = c.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  c = replaceDocumentComponents(c);

  c = c.replace(
    /^:::\s*(info|tip|warning|danger|details)\s*(.*?)\n([\s\S]*?)^:::\s*$/gm,
    (_m, type: string, title: string, body: string) => {
      const label = title.trim() || type.charAt(0).toUpperCase() + type.slice(1);
      const icon = pickIcon(CONTAINER_ICONS_UNICODE[type] ?? '', CONTAINER_ICONS_ASCII[type] ?? '');
      const quoted = body
        .trimEnd()
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
      return `> ${icon} **${label}**\n>\n${quoted}\n`;
    },
  );
  c = c.replace(/^:::\s*\w*.*$/gm, '');

  c = c.replace(
    /^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/gim,
    (_, type: string) => `> **${type.charAt(0) + type.slice(1).toLowerCase()}:**`,
  );

  c = c.replace(/\[\[toc\]\]/gi, '');

  c = c.replace(/^(#{1,6}\s+[^\n]*?)\s*\{#[^}]+\}\s*$/gm, '$1');

  c = c.replace(/==([^=\n]+)==/g, '**$1**');

  if (terminalType === 'basic') {
    c = c.replace(
      /!\[([^\]]*)\]\([^)]+\)/g,
      (_match: string, alt: string) =>
        `${pickIcon('📎', '[image]')} ${alt.length > 0 ? alt : 'image'}`,
    );
  } else {
    c = c.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match: string, alt: string, url: string) => {
      const basename = url.split('/').pop();
      const filename = basename?.length ? basename : url;
      return `${pickIcon('🖼️', '[image]')} **${alt.length > 0 ? alt : 'image'}** _(${filename})_`;
    });
  }

  c = c.replace(/<!--[\s\S]*?-->/g, '');

  c = replaceHtmlCheckboxes(c, terminalType);
  c = expandHtmlDetails(c);
  c = c.replace(/<br\s*\/?>/gi, '\n');
  c = c.replace(/<(?:hr|input|link|meta)\b[^>]*\/?>/gi, '');
  c = c.replace(/<([a-z][a-z0-9]*)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2');
  c = c.replace(/<[a-z][a-z0-9]*\b[^>]*\/>/gi, '');
  c = c.replace(/<\/(?:Split|TimelineEntry)>/gi, '');

  if (terminalType === 'basic') {
    c = c.replace(/^(\s*(?:[-*+]|\d+[.)]) )\[x\]/gim, '$1[x]');
  } else {
    c = c.replace(/^(\s*(?:[-*+]|\d+[.)]) )\[x\] /gim, '$1☑ ');
    c = c.replace(/^(\s*(?:[-*+]|\d+[.)]) )\[ \] /gm, '$1☐ ');
  }

  return c.replace(/\n{3,}/g, '\n\n');
}

export function cleanMarkdownContent(
  content: string,
  type: TerminalType = getTerminalType(),
): string {
  let c = sanitizeTerminalText(content);
  c = c.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
  c = processFencedCodeBlocks(c);
  c = transformOutsideFencedCodeBlocks(c, (value) => cleanMarkdownOutsideFences(value, type));

  return c.trim();
}

function estimateReadTime(text: string): string {
  const cjkChars = [...text.matchAll(/[㐀-鿿]/g)].length;
  const nonCjk = text.replace(/[㐀-鿿]/g, ' ');
  const words = nonCjk.trim().split(/\s+/).filter(Boolean).length;
  const units = words + cjkChars / 2;
  const mins = Math.max(1, Math.ceil(units / 220));
  return mins === 1 ? '~1 min' : `~${mins} min`;
}

function extractTOC(content: string): string[] {
  const lines = content.split('\n').filter((l) => /^#{2,3}\s/.test(l));
  return lines.map((l) => {
    const m = /^(#+)/.exec(l);
    const level = m?.[1]?.length ?? 2;
    const text = l.replace(/^#+\s+/, '').trim();
    return (level === 3 ? '  ' : '') + text;
  });
}

function hasMarkdownTable(content: string): boolean {
  return /^\|.+\|/m.test(content) && /^\|[-: |]+\|/m.test(content);
}

function hasMermaidBlock(content: string): boolean {
  return /^```mermaid\b/m.test(content);
}

export interface DocLink {
  href: string;
  text: string;
}

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

export function resolveInternalHref(href: string, fromPath: string): string {
  const normalizedHref = href.split(/[?#]/, 1)[0] ?? '';
  const fromDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const combined = normalizedHref.startsWith('/')
    ? normalizedHref.slice(1)
    : fromDir
      ? `${fromDir}/${normalizedHref}`
      : normalizedHref;
  const stack: string[] = [];
  for (const part of combined.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  let target = stack.join('/');
  if (target === '' || normalizedHref.endsWith('/')) target += (target ? '/' : '') + 'index';
  if (!target.endsWith('.md')) target += '.md';
  return target;
}

export interface ReaderDoc {
  path: string;
  title: string;
  lines: string[];
  links: DocLink[];
}

export async function loadDocForReader(filePath: string, signal?: AbortSignal): Promise<ReaderDoc> {
  ensureMarkedConfigured();
  const { renderedDoc } = await loadRenderedDoc(filePath, signal);

  const seen = new Set<string>();
  const links: DocLink[] = [];
  for (const raw of extractInternalLinks(renderedDoc.cleaned)) {
    const resolved = resolveInternalHref(raw.href, filePath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    links.push({ text: sanitizeTerminalLine(raw.text), href: resolved });
  }

  return {
    path: filePath,
    title: renderedDoc.title,
    lines: renderedDoc.rendered.split('\n'),
    links,
  };
}

const TOP_SECTION_ORDER = ['about', 'guide', 'repair', 'concepts', 'archived'];
const TOP_SECTION_SKIP = new Set(['docs', 'index.md', 'README.md']);
const SECTION_ALIAS: Readonly<Record<string, string>> = { tutorial: 'guide', process: 'guide' };

export interface DocSection {
  key: string;
  label: string;
  count: number;
  files: ListedDoc[];
}

export interface ListedDoc extends DocItem {
  title: string;
  summary: string;
}

export interface SearchDoc extends ListedDoc {
  excerpt: string;
  route: string;
  score: number;
  section: string | null;
}

export function localizeDocSections(
  sections: readonly DocSection[],
  trans: Translations = t(),
): DocSection[] {
  const labels: Record<string, string> = {
    about: trans.docs.categoryAbout,
    guide: trans.docs.categoryGuide,
    repair: trans.docs.categoryRepair,
    concepts: trans.docs.categoryConcepts,
    archived: trans.docs.categoryArchived,
  };
  return sections.map((section) => ({ ...section, label: labels[section.key] ?? section.label }));
}

export function cleanFileName(name: string): string {
  const base = sanitizeTerminalLine(name).replace(/\.md$/, '');
  if (/^[\d.]/.test(base)) return base;
  return base.replace(/[-_]/g, ' ').replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function displayDocTitle(name: string, title?: string): string {
  const candidate = title?.trim();
  return sanitizeTerminalLine(candidate?.length ? candidate : cleanFileName(name));
}

function listedDoc(item: DocItem, metadata?: DocMetadata): ListedDoc {
  return {
    ...item,
    name: sanitizeTerminalLine(item.name),
    title: displayDocTitle(item.name, metadata?.title),
    summary: sanitizeTerminalLine(metadata?.summary ?? ''),
  };
}

export async function fetchDocMetadata(
  items: readonly DocItem[],
  signal?: AbortSignal,
): Promise<ListedDoc[]> {
  const results = items.map((item) => listedDoc(item));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (!item) continue;
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Aborted', 'AbortError');
      }
      try {
        results[index] = listedDoc(item, await loadDocMetadata(item.path, signal));
      } catch (error) {
        if (signal?.aborted) throw error;
        results[index] = listedDoc(item);
      }
    }
  }

  const workerCount = Math.min(METADATA_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export async function fetchSectionMetadata(
  section: DocSection,
  signal?: AbortSignal,
): Promise<DocSection> {
  const files = await fetchDocMetadata(section.files, signal);
  return { ...section, count: files.length, files };
}

function searchDoc(result: DocsSearchResult): SearchDoc {
  return {
    name: sanitizeTerminalLine(result.name),
    path: result.path,
    type: 'file',
    title: displayDocTitle(result.name, result.title),
    summary: sanitizeTerminalLine(result.summary),
    excerpt: sanitizeTerminalLine(result.excerpt),
    route: result.route,
    score: result.score,
    section: result.section,
  };
}

export async function searchDocuments(query: string, signal?: AbortSignal): Promise<SearchDoc[]> {
  return (
    await runDocsClientOperation(signal, (client) => client.search(query, { limit: 20 }))
  ).map(searchDoc);
}

export function buildSections(all: DocItem[]): DocSection[] {
  const groups = new Map<string, ListedDoc[]>();
  for (const item of all) {
    const parts = item.path.split('/');
    if (parts.length < 2) continue;
    const rawTop = parts[0];
    if (!rawTop) continue;
    if (TOP_SECTION_SKIP.has(rawTop)) continue;
    const top = SECTION_ALIAS[rawTop] ?? rawTop;
    if (!TOP_SECTION_ORDER.includes(top)) continue;
    const items = groups.get(top);
    const file = listedDoc(item);
    if (items) items.push(file);
    else groups.set(top, [file]);
  }

  const orderedGroups = TOP_SECTION_ORDER.flatMap((key) => {
    const files = groups.get(key);
    return files ? [{ key, label: key, count: files.length, files }] : [];
  });
  return localizeDocSections(orderedGroups);
}

export function getArchivedGroups(files: ListedDoc[]): Map<string, ListedDoc[]> {
  const groups = new Map<string, ListedDoc[]>();
  for (const item of files) {
    const group = item.path.split('/')[1] ?? 'other';
    const items = groups.get(group);
    if (items) items.push(item);
    else groups.set(group, [item]);
  }
  return groups;
}

export async function fetchAllDocs(signal?: AbortSignal): Promise<DocItem[]> {
  return runDocsClientOperation(signal, (client) => client.listAll());
}

export async function fetchSections(signal?: AbortSignal): Promise<DocSection[]> {
  const docs = await fetchAllDocs(signal);
  saveDocsIndex(docs);
  return buildSections(docs);
}

export function peekSections(): DocSection[] | null {
  const docs = loadDocsIndex();
  if (!docs) return null;
  try {
    return buildSections(docs);
  } catch {
    return null;
  }
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

function pipeToPager(
  command: string,
  args: string[],
  content: string,
  plain = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (plain) {
      delete env['FORCE_COLOR'];
      env['NO_COLOR'] = '1';
      env['CLICOLOR'] = '0';
      env['CLICOLOR_FORCE'] = '0';
    }
    const child = spawn(command, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      ...(plain ? { env } : {}),
    });
    let settled = false;
    const finish = (started: boolean) => {
      if (settled) return;
      settled = true;
      resolve(started);
    };

    child.once('close', () => {
      finish(true);
    });
    child.once('error', () => {
      finish(false);
    });
    child.stdin.once('error', () => {
      finish(true);
    });
    try {
      child.stdin.end(content, 'utf8');
    } catch {
      finish(false);
    }
  });
}

export async function displayWithGlow(cleanedMarkdown: string): Promise<boolean> {
  if (chalk.level === 0) return false;
  const cols = String(Math.min(process.stdout.columns || 80, 80));
  return pipeToPager('glow', ['--pager', '--width', cols, '-'], cleanedMarkdown);
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

  const tocBlock =
    toc.length >= 3
      ? [
          chalk.dim(`  ${trans.docs.tocTitle}`),
          chalk.dim(`  ${'─'.repeat(36)}`),
          ...toc.map((h) => chalk.dim(`  ${h}`)),
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

  const footer = ['', rule, chalk.dim(`  ${trans.docs.endOfDocument}`), ''].join('\n');

  const plain = chalk.level === 0;
  const fullContent = plain
    ? sanitizeTerminalText(header + rendered + footer)
    : header + rendered + footer;
  const pagerSetting = (process.env['PAGER'] ?? 'less').trim();
  const [pagerCommand = 'less', ...pagerArgs] = pagerSetting.split(/\s+/).filter(Boolean);
  const isLess = /(?:^|[\\/])less(?:\.exe)?$/i.test(pagerCommand);
  const args = isLess
    ? [...pagerArgs, ...(plain ? [] : ['-R']), '-F', '-X', '-i', '-j4']
    : pagerArgs;

  if (!commandExists(pagerCommand)) {
    console.log(fullContent);
    return;
  }

  if (!(await pipeToPager(pagerCommand, args, fullContent, plain))) console.log(fullContent);
}

async function showDocSection(section: DocSection): Promise<void> {
  const trans = t();

  if (section.key === 'archived') {
    await showArchivedSection(section.files);
    return;
  }

  const spinner = createSpinner(trans.docs.loading);
  const hydrated = await fetchSectionMetadata(section);
  spinner.stop();
  const files = hydrated.files.filter(
    (file) => file.name !== 'index.md' && !file.name.startsWith('index.'),
  );
  if (files.length === 0) return;

  const selected = await runMenu({
    title: hydrated.label,
    options: [
      ...files.map((file) => ({
        value: file.path,
        label: displayDocTitle(file.name, file.title),
        ...(!file.summary ? {} : { hint: file.summary }),
      })),
      { value: '__back__', label: chalk.dim(trans.common.back) },
    ],
    footer: menuFooter(),
  });

  if (selected === null || selected === '__back__') return;
  await viewMarkdownFile(selected);
}

async function showArchivedSection(files: ListedDoc[]): Promise<void> {
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
      ...sortedKeys.map((k) => ({
        value: k,
        label: k,
        hint: String(groups.get(k)?.length ?? 0),
      })),
      { value: '__back__', label: chalk.dim(trans.common.back) },
    ],
    footer: menuFooter(),
  });

  if (groupKey === null || groupKey === '__back__') return;

  const spinner = createSpinner(trans.docs.loading);
  const groupFiles = await fetchDocMetadata(groups.get(groupKey) ?? []);
  spinner.stop();
  const subDirs = new Set(groupFiles.map((f) => f.path.split('/')[2]).filter(Boolean));
  const fileSelected = await runMenu({
    title: `${trans.docs.categoryArchived} · ${groupKey}`,
    options: [
      ...groupFiles.map((f) => {
        const sub = f.path.split('/').slice(2, -1).join('/');
        return {
          value: f.path,
          label: displayDocTitle(f.name, f.title),
          ...(subDirs.size > 1 ? { hint: sanitizeTerminalLine(sub) } : {}),
        };
      }),
      { value: '__back__', label: chalk.dim(trans.common.back) },
    ],
    footer: menuFooter(),
  });

  if (fileSelected === null || fileSelected === '__back__') return;
  await viewMarkdownFile(fileSelected);
}

async function viewMarkdownFile(filePath: string): Promise<void> {
  const trans = t();
  ensureMarkedConfigured();
  const s = createSpinner(`${trans.docs.loadingFile}: ${filePath}`);
  try {
    const { rawContent, renderedDoc } = await loadRenderedDoc(filePath);

    s.stop(`${chalk.bold(renderedDoc.title)}  ${chalk.dim(renderedDoc.readTime)}`);

    const toc = extractTOC(renderedDoc.cleaned);
    if (chalk.level > 0 && hasGlow()) {
      if (!(await displayWithGlow(renderedDoc.cleaned))) {
        await displayWithLess(
          renderedDoc.rendered,
          renderedDoc.title,
          filePath,
          renderedDoc.readTime,
          toc,
        );
      }
    } else {
      await displayWithLess(
        renderedDoc.rendered,
        renderedDoc.title,
        filePath,
        renderedDoc.readTime,
        toc,
      );
    }

    const needsBrowser = hasMarkdownTable(rawContent) || hasMermaidBlock(rawContent);
    const action = await runMenu({
      title: trans.docs.chooseAction,
      options: [
        { value: 'back', label: trans.docs.backToList },
        {
          value: 'browser',
          label: trans.docs.openBrowser,
          ...(needsBrowser ? { hint: trans.docs.tableHint } : {}),
        },
      ],
      footer: menuFooter(),
    });

    if (action === 'browser') {
      await openDocsInBrowser(filePath);
    }
  } catch (err: unknown) {
    s.error(trans.docs.loadError);
    const errMsg = sanitizeTerminalLine(err instanceof Error ? err.message : String(err));
    console.log(chalk.gray(`  ${trans.docs.errorHint}: ${errMsg}`));

    const openBrowser = await runConfirm({ message: trans.docs.openBrowserPrompt });
    if (openBrowser === true) {
      await openDocsInBrowser(filePath);
    }
  }
}

export async function openDocsInBrowser(path?: string, signal?: AbortSignal): Promise<boolean> {
  const trans = t();
  const s = createSpinner(trans.docs.opening);
  let url = docsUrlFromPath(path);
  try {
    if (path) {
      try {
        url = docsUrlFromRoute((await loadDocMetadata(path, signal)).route);
      } catch {
        if (signal?.aborted) {
          s.stop();
          return false;
        }
        url = docsUrlFromPath(path);
      }
    }
    if (signal?.aborted) {
      s.stop();
      return false;
    }
    if (!(await launchBrowserUrl(url))) throw new Error('Browser launcher failed');
    if (signal?.aborted) {
      s.stop();
      return false;
    }
    s.stop(trans.docs.browserOpened);
    console.log();
    return true;
  } catch {
    if (signal?.aborted) {
      s.stop();
      return false;
    }
    s.error(trans.docs.browserError);
    console.log(chalk.gray(`  ${fmt(t().links.openManually, { url })}`));
    console.log();
    return false;
  }
}

function docsUrlFromRoute(route: string): string {
  const safeRoute = sanitizeTerminalLine(route);
  if (!safeRoute) return URLS.docs;
  const encodedRoute = safeRoute
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${URLS.docs}${encodedRoute}`;
}

export function docsUrlFromPath(path?: string): string {
  return path ? docsUrlFromRoute(docsRouteFromPath(sanitizeTerminalLine(path))) : URLS.docs;
}

export function docsRouteFromPath(path: string): string {
  const withoutExtension = path.replace(/\.md$/i, '');
  if (withoutExtension === 'index') return '/';
  if (withoutExtension.endsWith('/index')) return `/${withoutExtension.slice(0, -5)}`;
  return `/${withoutExtension}`;
}

async function searchDocs(): Promise<void> {
  const trans = t();
  const query = await runTextInput({
    message: trans.docs.searchPrompt,
    placeholder: trans.docs.searchPlaceholder,
  });

  if (!query?.trim()) return;

  const s = createSpinner(trans.docs.searching);

  try {
    const results = await searchDocuments(query.trim());

    s.stop(`${results.length} ${trans.docs.searchResults}`);

    if (results.length === 0) {
      warning(trans.docs.searchNoResults);
      return;
    }

    const selected = await runMenu({
      title: trans.docs.chooseDoc,
      options: [
        ...results.map((r) => ({
          value: r.path,
          label: r.title,
          hint: truncate(
            r.excerpt ||
              r.summary ||
              (r.path.includes('/')
                ? sanitizeTerminalLine(r.path.split('/').slice(0, -1).join('/'))
                : ''),
            44,
          ),
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

export async function showDocsMenu(): Promise<void> {
  await enterScreen(breadcrumb(t().menu.docs));
  const sections = await loadSections();
  if (!sections) return;

  for (;;) {
    const trans = t();
    const action = await runMenu({
      title: trans.docs.chooseCategory,
      options: [
        ...sections.map((sec) => ({ value: sec.key, label: sec.label })),
        { value: 'search', label: chalk.dim(trans.docs.searchPrompt.replace(':', '')) },
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
      const section = sections.find((s) => s.key === action);
      if (section) await showDocSection(section);
    }
  }
}
