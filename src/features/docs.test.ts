import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { marked } from 'marked';
import chalk from 'chalk';
import open from 'open';
import {
  cleanFileName,
  displayDocTitle,
  buildSections,
  cleanMarkdownContent,
  ensureMarkedConfigured,
  resolveInternalHref,
  docsRouteFromPath,
  docsUrlFromPath,
  openDocsInBrowser,
  clearDocsCache,
  displayWithGlow,
  loadDocForReader,
  fetchAllDocs,
} from './docs.js';
import { setLanguage } from '../i18n/index.js';
import { stripAnsi } from '../core/text.js';
import type { DocItem } from '@nbtca/docs';

const spawnMock = vi.hoisted(() => vi.fn());

function completedLauncher(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  Object.defineProperty(child, 'exitCode', { value: 0, configurable: true });
  Object.defineProperty(child, 'signalCode', { value: null, configurable: true });
  return child;
}

vi.mock('open', () => ({ default: vi.fn() }));
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  spawn: spawnMock,
}));

beforeAll(() => {
  setLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(open).mockClear();
  spawnMock.mockReset();
  clearDocsCache();
});

describe('cleanFileName', () => {
  it('title-cases a kebab-case English filename', () => {
    expect(cleanFileName('clean-drive-c.md')).toBe('Clean Drive C');
  });

  it('leaves a filename starting with a digit untouched (dates, etc.)', () => {
    expect(cleanFileName('2022.10.29例会.md')).toBe('2022.10.29例会');
  });

  it('preserves Chinese characters', () => {
    expect(cleanFileName('预算经费公示.md')).toBe('预算经费公示');
  });
});

describe('displayDocTitle', () => {
  it('derives readable titles from filenames', () => {
    expect(displayDocTitle('os-skills.md')).toBe('Os Skills');
    expect(displayDocTitle('guide.md')).toBe('Guide');
  });

  it('handles newly added documents without a mapping', () => {
    expect(displayDocTitle('some-new-doc.md')).toBe('Some New Doc');
  });

  it('preserves date-prefixed archive filenames', () => {
    expect(displayDocTitle('2022.10.29例会.md')).toBe('2022.10.29例会');
  });

  it('prefers document metadata and strips terminal control sequences', () => {
    expect(displayDocTitle('fallback.md', '\u001B]0;bad\u0007Human title')).toBe('Human title');
  });
});

describe('buildSections', () => {
  const item = (path: string): DocItem => ({
    path,
    name: path.split('/').at(-1) ?? path,
    type: 'file',
  });

  it('recognizes every real top-level section in nbtca/documents, including about/ and concepts/', () => {
    const all = [
      item('about/what-is-nbtca.md'),
      item('tutorial/manual/os-skills.md'),
      item('process/2025/reimbursement-process.md'),
      item('repair/guide.md'),
      item('concepts/ca101.md'),
      item('archived/2022/notes.md'),
    ];
    const sections = buildSections(all);
    const keys = sections.map((s) => s.key);
    expect(keys).toEqual(['about', 'guide', 'repair', 'concepts', 'archived']);
  });

  it('merges tutorial/ and process/ into one "guide" section, matching how nbtca/documents\' own site nav presents them', () => {
    const all = [
      item('tutorial/manual/os-skills.md'),
      item('tutorial/2025/github-workflow.md'),
      item('process/2025/reimbursement-process.md'),
    ];
    const sections = buildSections(all);
    expect(sections.map((s) => s.key)).toEqual(['guide']);
    expect(sections[0]?.count).toBe(3);
    expect(sections[0]?.files.map((f) => f.path)).toEqual([
      'tutorial/manual/os-skills.md',
      'tutorial/2025/github-workflow.md',
      'process/2025/reimbursement-process.md',
    ]);
  });

  it('drops files under an unrecognized top-level directory rather than crashing', () => {
    const sections = buildSections([item('some-future-section/new-thing.md')]);
    expect(sections).toEqual([]);
  });

  it('drops docs/ (meta content about the docs themselves, not member-facing) via TOP_SECTION_SKIP', () => {
    const sections = buildSections([item('docs/editorial-standard.md')]);
    expect(sections).toEqual([]);
  });

  it('omits sections that have no files, rather than showing an empty category', () => {
    const sections = buildSections([item('repair/guide.md')]);
    expect(sections.map((s) => s.key)).toEqual(['repair']);
  });
});

describe('cleanMarkdownContent', () => {
  it('converts a VitePress container into a labeled blockquote', () => {
    const out = cleanMarkdownContent(
      '::: warning 以官方为准\n最后核对：2026-07。\n:::\n',
      'advanced',
    );
    expect(out).toContain('> ');
    expect(out).toContain('以官方为准');
    expect(out).toContain('最后核对：2026-07。');
    expect(out).not.toContain(':::');
  });

  it('only removes frontmatter at the beginning of a document', () => {
    expect(cleanMarkdownContent('---\ntitle: Guide\n---\n# Body', 'basic')).toBe('# Body');
    const thematic = '# Body\n\n---\nkeep this\n---\n';
    expect(cleanMarkdownContent(thematic, 'basic')).toContain('keep this');
  });

  it('removes terminal control sequences from remote Markdown', () => {
    const source = 'safe\u001B]52;c;YWJj\u0007\u001B[31mred\u001B[0m';
    expect(cleanMarkdownContent(source, 'basic')).toBe('safered');
  });

  it('preserves Markdown autolinks while removing HTML wrappers', () => {
    const source = '<div>Visit <https://example.com> or <team@example.com>.</div>';
    const out = cleanMarkdownContent(source, 'basic');
    expect(out).toContain('<https://example.com>');
    expect(out).toContain('<team@example.com>');
    expect(out).not.toContain('<div>');
  });

  it('keeps meaningful content from the documents site components', () => {
    const source = [
      '<PageHero title="About" lede="A useful community." />',
      '<LinkCards>',
      '<LinkCard href="/about/join" title="Join" desc="Ways to participate." />',
      '</LinkCards>',
      '<Split heading="In person">Body</Split>',
      '<Timeline><TimelineEntry year="2026" title="Today">Milestone</TimelineEntry></Timeline>',
      '<Figure src="./photo.jpg" alt="People" caption="At the event" date="2026-07" />',
      `<FactStrip :facts="[{ label: 'Founded', value: '2001' }]" />`,
    ].join('\n');

    const out = cleanMarkdownContent(source, 'basic');
    expect(out).toContain('# About');
    expect(out).toContain('A useful community.');
    expect(out).toContain('[Join](/about/join) — Ways to participate.');
    expect(out).toContain('### In person');
    expect(out).toContain('### 2026 · Today');
    expect(out).toContain('[image] At the event');
    expect(out).toContain('**Founded:** 2001');
    expect(out).not.toMatch(/<(?:PageHero|LinkCard|Split|Timeline|Figure|FactStrip)/);
  });

  it('preserves budget checkboxes and expanded invoice details', () => {
    const source = [
      '| Item | Purchased | Paid |',
      '| --- | --- | --- |',
      '| Server | <input type="checkbox" checked disabled> | <input disabled type=checkbox/> |',
      '',
      '<details>',
      '<summary>Invoice information (from Excel)</summary>',
      '',
      '| Field | Value |',
      '| --- | --- |',
      '| Tax ID | 123456 |',
      '',
      '</details>',
    ].join('\n');

    const basic = cleanMarkdownContent(source, 'basic');
    expect(basic).toContain('| Server | [x] | [ ] |');
    expect(basic).toContain('### Invoice information (from Excel)');
    expect(basic).toContain('| Tax ID | 123456 |');
    expect(basic).not.toMatch(/<\/?(?:input|details|summary)\b/i);

    const enhanced = cleanMarkdownContent(source, 'enhanced');
    expect(enhanced).toContain('| Server | ☑ | ☐ |');

    expect(
      cleanMarkdownContent(
        '- <input type="checkbox" checked> Ordered\n- <input type="checkbox"> Pending',
        'basic',
      ),
    ).toBe('- [x] Ordered\n- [ ] Pending');
  });

  it('does not rewrite HTML examples inside fenced code', () => {
    const sources = [
      { bodyPrefix: '', closing: '```', opening: '```html' },
      { bodyPrefix: '', closing: '~~~', opening: '~~~html' },
      { bodyPrefix: '   ', closing: '   ```', opening: '   ```html' },
      { bodyPrefix: '> ', closing: '> ```', opening: '> ```html' },
      { bodyPrefix: '  ', closing: '  ```', opening: '- ```html' },
      {
        bodyPrefix: '    ',
        closing: '    ~~~',
        opening: '- item\n\n    ~~~html',
      },
    ];

    for (const { bodyPrefix, closing, opening } of sources) {
      const source = [
        opening,
        `${bodyPrefix}<input type="checkbox" checked>`,
        `${bodyPrefix}<details><summary>Invoice</summary>Body</details>`,
        closing,
      ].join('\n');
      const output = cleanMarkdownContent(source, 'basic');
      expect(output).toContain('<input type="checkbox" checked>');
      expect(output).toContain('<details><summary>Invoice</summary>Body</details>');
      expect(output).not.toContain('[x]');
      expect(output).not.toContain('### Invoice');
    }
  });

  it('does not treat an indented code line as an opening fence', () => {
    const source = 'Intro\n\n    ```\n\n<input type="checkbox" checked>';

    expect(cleanMarkdownContent(source, 'basic')).toContain('[x]');
  });
});

describe('resolveInternalHref', () => {
  it('ignores URL fragments and queries when resolving repository paths', () => {
    expect(resolveInternalHref('./install#linux', 'guide/index.md')).toBe('guide/install.md');
    expect(resolveInternalHref('./install?mode=plain', 'guide/index.md')).toBe('guide/install.md');
  });
});

describe('docsRouteFromPath', () => {
  it('uses the canonical site route for section indexes', () => {
    expect(docsRouteFromPath('about/index.md')).toBe('/about/');
    expect(docsRouteFromPath('index.md')).toBe('/');
    expect(docsRouteFromPath('concepts/school.md')).toBe('/concepts/school');
  });

  it('builds an encoded, terminal-safe manual URL', () => {
    expect(docsUrlFromPath('tutorial/manual/team guide\u001B]0;bad\u0007.md')).toBe(
      'https://docs.nbtca.space/tutorial/manual/team%20guide',
    );
    expect(docsUrlFromPath('tutorial/manual/topic?draft#intro')).toBe(
      'https://docs.nbtca.space/tutorial/manual/topic%3Fdraft%23intro',
    );
    expect(docsUrlFromPath('')).toBe('https://docs.nbtca.space');
  });

  it('opens an index document with the route returned by the docs client', async () => {
    vi.mocked(open).mockResolvedValueOnce(completedLauncher());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('---\ntitle: About\n---\n'),
      }),
    );

    const opened = await openDocsInBrowser('about/index.md');

    expect(opened).toBe(true);
    expect(open).toHaveBeenCalledWith('https://docs.nbtca.space/about/');
  });

  it('reports a browser launch failure', async () => {
    vi.mocked(open).mockRejectedValueOnce(new Error('no browser'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(openDocsInBrowser()).resolves.toBe(false);

    log.mockRestore();
  });
});

describe('docs request cancellation', () => {
  it('aborts the underlying client fetch and releases its timeout', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      }),
    );
    const lifecycle = new AbortController();
    const request = fetchAllDocs(lifecycle.signal);
    await Promise.resolve();

    expect(requestSignal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    lifecycle.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    await Promise.resolve();

    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('document rendering', () => {
  const markdown = '# Table\n\n| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n';

  function stubDocument(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(markdown),
      }),
    );
  }

  it('removes all terminal escapes from plain reader content, including tables', async () => {
    const level = chalk.level;
    chalk.level = 0;
    stubDocument();

    try {
      const doc = await loadDocForReader('guide/table.md');
      const rendered = doc.lines.join('\n');
      expect(rendered).toContain('Alpha');
      expect(rendered).toBe(stripAnsi(rendered));
      expect(rendered).not.toMatch(/[\u001B\u009B\u009D]/u);
    } finally {
      chalk.level = level;
    }
  });

  it('keeps plain and colored render cache entries separate', async () => {
    const level = chalk.level;
    stubDocument();

    try {
      chalk.level = 0;
      const plain = (await loadDocForReader('guide/table.md')).lines.join('\n');
      chalk.level = 3;
      const colored = (await loadDocForReader('guide/table.md')).lines.join('\n');

      expect(plain).toBe(stripAnsi(plain));
      expect(colored).not.toBe(stripAnsi(colored));
    } finally {
      chalk.level = level;
    }
  });

  it('bypasses glow in plain mode', async () => {
    const level = chalk.level;
    chalk.level = 0;

    try {
      await expect(displayWithGlow(markdown)).resolves.toBe(false);
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      chalk.level = level;
    }
  });

  it('pipes Markdown to glow when colors are enabled', async () => {
    const level = chalk.level;
    const stdin = new PassThrough();
    const child = Object.assign(new EventEmitter(), { stdin });
    let input = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => {
      input += chunk;
    });
    stdin.once('finish', () => child.emit('close', 0));
    spawnMock.mockReturnValue(child);
    chalk.level = 3;

    try {
      await expect(displayWithGlow(markdown)).resolves.toBe(true);
      expect(spawnMock).toHaveBeenCalledWith('glow', ['--pager', '--width', '80', '-'], {
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      expect(input).toBe(markdown);
    } finally {
      chalk.level = level;
    }
  });
});

describe('internal wiki link rendering (via the configured marked/marked-terminal pipeline)', () => {
  ensureMarkedConfigured();

  it('strips the path from internal links (./x, ../x, /x) -- text only, no dead path', async () => {
    const out = stripAnsi(
      await marked('见 [计算机学院](/concepts/college) 和 [什么是 NBTCA](./what-is-nbtca) 词条。'),
    );
    expect(out).toContain('计算机学院');
    expect(out).toContain('什么是 NBTCA');
    expect(out).not.toContain('/concepts/college');
    expect(out).not.toContain('./what-is-nbtca');
  });

  it('leaves external links untouched -- those resolve to something real if followed', async () => {
    const out = stripAnsi(await marked('见 [学校官网](https://www.nbt.edu.cn) 。'));
    expect(out).toContain('www.nbt.edu.cn');
  });
});
