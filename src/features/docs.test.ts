import { describe, it, expect, beforeAll } from 'vitest';
import { marked } from 'marked';
import { cleanFileName, displayDocTitle, buildSections, cleanMarkdownContent, ensureMarkedConfigured } from './docs.js';
import { setLanguage } from '../i18n/index.js';
import { stripAnsi } from '../core/text.js';
import type { DocItem } from '@nbtca/docs';

beforeAll(() => setLanguage('en'));

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
  it('returns the known real title for a mapped tutorial/process/repair doc', () => {
    expect(displayDocTitle('tutorial/manual/os-skills.md', 'os-skills.md')).toBe('基础操作系统的使用技术');
    expect(displayDocTitle('repair/guide.md', 'guide.md')).toBe('维修操作指南');
  });

  it('falls back to cleanFileName for an unmapped path', () => {
    // A doc added after this mapping was written, or one that was never
    // worth mapping — must never throw or return a blank label.
    expect(displayDocTitle('tutorial/manual/some-new-doc.md', 'some-new-doc.md')).toBe('Some New Doc');
  });

  it('falls back to cleanFileName for archived/ docs, by design (not an oversight)', () => {
    // archived/ meeting notes often share the same generic real heading
    // across many different dates (five different files all titled just
    // "维修日") -- the date-prefixed filename is what actually
    // distinguishes them in the list, so archived/ is deliberately never
    // in KNOWN_DOC_TITLES.
    expect(displayDocTitle('archived/2022/2022.10.29例会.md', '2022.10.29例会.md')).toBe('2022.10.29例会');
  });
});

describe('buildSections', () => {
  const item = (path: string): DocItem => ({ path, name: path.split('/').pop()!, type: 'file' });

  it('recognizes every real top-level section in nbtca/documents, including about/ and concepts/', () => {
    // Regression: about/ and concepts/ were added to nbtca/documents in its
    // 2026-07 wiki reconstruction (5beee27, 5abcc4d) but TOP_SECTION_ORDER
    // wasn't updated to match -- buildSections silently dropped every file
    // under them (line 432's `if (!TOP_SECTION_ORDER.includes(top)) continue`),
    // so the whole section just never appeared in the Docs tab, with no
    // error to notice.
    const all = [
      item('about/what-is-nbtca.md'),
      item('tutorial/manual/os-skills.md'),
      item('process/2025/reimbursement-process.md'),
      item('repair/guide.md'),
      item('concepts/ca101.md'),
      item('archived/2022/notes.md'),
    ];
    const sections = buildSections(all);
    const keys = sections.map(s => s.key);
    expect(keys).toEqual(['about', 'guide', 'repair', 'concepts', 'archived']);
  });

  it('merges tutorial/ and process/ into one "guide" section, matching how nbtca/documents\' own site nav presents them', () => {
    // tutorial/sidebar.ts: "「指南」= 教程（学技术）+流程（办社务）高内聚合并为一栏,
    // 同一份边栏同时挂在 /tutorial/ 与 /process/ 下" -- the folders stay separate
    // on disk, but a reader (web or terminal) should see one section, not two.
    const all = [
      item('tutorial/manual/os-skills.md'),
      item('tutorial/2025/github-workflow.md'),
      item('process/2025/reimbursement-process.md'),
    ];
    const sections = buildSections(all);
    expect(sections.map(s => s.key)).toEqual(['guide']);
    expect(sections[0]?.count).toBe(3);
    expect(sections[0]?.files.map(f => f.path)).toEqual([
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
    // docs/editorial-standard.md and docs/reconstruction-notes.md are real
    // files in nbtca/documents, but they're notes for whoever maintains the
    // wiki, not knowledge base content for a club member browsing Docs --
    // same category as CONTRIBUTING.md, intentionally excluded.
    const sections = buildSections([item('docs/editorial-standard.md')]);
    expect(sections).toEqual([]);
  });

  it('omits sections that have no files, rather than showing an empty category', () => {
    const sections = buildSections([item('repair/guide.md')]);
    expect(sections.map(s => s.key)).toEqual(['repair']);
  });
});

describe('cleanMarkdownContent', () => {
  it('converts a VitePress container into a labeled blockquote', () => {
    const out = cleanMarkdownContent(
      '::: warning 以官方为准\n最后核对：2026-07。\n:::\n', 'advanced',
    );
    expect(out).toContain('> ');
    expect(out).toContain('以官方为准');
    expect(out).toContain('最后核对：2026-07。');
    expect(out).not.toContain(':::');
  });

});

describe('internal wiki link rendering (via the configured marked/marked-terminal pipeline)', () => {
  // These live at the marked renderer level (ensureMarkedConfigured's link
  // override), not as a cleanMarkdownContent text rewrite -- an earlier
  // version pre-colored link text with raw chalk ANSI codes and spliced
  // that into the markdown *before* marked() ran, which broke once
  // marked-terminal's own text reflow/wrapping touched the already-escaped
  // text: the escape sequences got corrupted into literal visible
  // "[36m...[24m" garbage in a real terminal. Rendering through the actual
  // renderer instead of a text-substitution hack is what these tests guard.
  ensureMarkedConfigured();

  it('strips the path from internal links (./x, ../x, /x) -- text only, no dead path', async () => {
    // Regression: nbtca/documents' whole cross-linking model assumes a
    // browser that can follow the link and hover-preview it -- a terminal
    // pager can do neither, so showing the raw path (e.g. "计算机学院
    // (/concepts/college)") was pure noise cluttering the self-contained
    // first-paragraph reading the site's own editorial standard is built
    // around ("首段即答案").
    const out = stripAnsi(await marked('见 [计算机学院](/concepts/college) 和 [什么是 NBTCA](./what-is-nbtca) 词条。'));
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
