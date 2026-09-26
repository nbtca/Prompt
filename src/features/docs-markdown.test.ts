import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { marked } from 'marked';
import { renderMarkdown } from './docs-markdown.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi, visualWidth } from '../core/text.js';

const level = chalk.level;

function render(source: string, width = 60): string[] {
  return renderMarkdown(marked.lexer(source), width).map(stripAnsi);
}

function expectWithin(lines: readonly string[], width: number): void {
  for (const line of lines) expect(visualWidth(line)).toBeLessThanOrEqual(width);
}

beforeEach(() => {
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
  chalk.level = 3;
});

afterEach(() => {
  chalk.level = level;
});

describe('links', () => {
  it('shows only the text of internal links (./x, ../x, /x, #anchor)', () => {
    const out = render(
      '见 [计算机学院](/concepts/college)、[什么是 NBTCA](./what-is-nbtca) 和 [沿革](#沿革) 词条。',
    ).join('\n');
    expect(out).toContain('计算机学院');
    expect(out).toContain('什么是 NBTCA');
    expect(out).not.toContain('/concepts/college');
    expect(out).not.toContain('./what-is-nbtca');
    expect(out).not.toContain('#沿革');
  });

  it('keeps the target of external links, once', () => {
    expect(render('见 [学校官网](https://www.nbt.edu.cn) 。').join('\n')).toContain(
      '学校官网 (https://www.nbt.edu.cn)',
    );
    expect(render('<https://example.com>').join('\n')).toBe('https://example.com');
    expect(render('[github.com/nbtca](https://github.com/nbtca/)').join('\n')).toBe(
      'github.com/nbtca',
    );
  });
});

describe('text', () => {
  it('decodes entities without letting control characters through', () => {
    expect(render('a &amp; b &lt;c&gt; &#169; &#27;[31m').join('\n')).toBe('a & b <c> © [31m');
  });

  it('joins soft breaks without a space between CJK characters', () => {
    expect(render('第一行\n第二行\nand more\nwords').join('\n')).toBe(
      '第一行第二行 and more words',
    );
  });

  it('distinguishes heading levels even without color', () => {
    chalk.level = 0;
    expect(render('## 概览\n\n正文')).toEqual(['概览', '────', '', '正文']);
  });
});

describe('lists', () => {
  it('hangs wrapped item text under the item, at every nesting level', () => {
    const lines = render(
      '- Join us — how students can take part in the community today\n  - 本校学生怎么加入、想参与开源怎么上手，以及怎么找到我们',
      24,
    );
    expectWithin(lines, 24);
    expect(lines[0]).toMatch(/^• Join/);
    expect(lines[1]).toMatch(/^ {2}\S/);
    const nested = lines.findIndex((line) => line.startsWith('  ◦ '));
    expect(nested).toBeGreaterThan(0);
    for (const line of lines.slice(nested + 1)) expect(line).toMatch(/^ {4}\S/);
    expect(lines.join('').replace(/[\s•◦]/g, '')).toBe(
      'Joinus—howstudentscantakepartinthecommunitytoday本校学生怎么加入、想参与开源怎么上手，以及怎么找到我们',
    );
  });

  it('right-aligns ordered markers and renders task boxes', () => {
    const items = Array.from({ length: 10 }, (_, index) => `${index + 1}. item`).join('\n');
    const lines = render(items);
    expect(lines[0]).toBe(' 1. item');
    expect(lines[9]).toBe('10. item');
    expect(render('- [x] done\n- [ ] todo')).toEqual(['• ☑ done', '• ☐ todo']);
  });

  it('falls back to ASCII markers', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    expect(render('- [x] done\n  - [ ] todo')).toEqual(['- [x] done', '      - [ ] todo']);
  });
});

describe('code blocks', () => {
  it('labels the language and keeps every line in a gutter inside the width', () => {
    const lines = render(
      '```bash\ncommand -v git      # the one that actually runs\n\n\techo $PATH\n```',
      30,
    );
    expectWithin(lines, 30);
    expect(lines[0]).toBe('bash');
    expect(lines.slice(1).every((line) => line.startsWith('│'))).toBe(true);
    expect(lines).toContain('│');
    expect(lines).toContain('│     echo $PATH');
  });
});

describe('tables', () => {
  const table = [
    '| 年份 | 部门结构 | 出处 |',
    '| --- | --- | ---: |',
    '| 2008 | 办公室、活动部、宣传部、技术部；维修队由会长直辖 | 展板稿 |',
    '| 2013 · 07 | 活动部、维修技术部、软件技术部、移动智能及硬件发烧友之家、宣传部（5 部） | 第十二届换届公示 |',
  ].join('\n');

  it('boxes a table that fits', () => {
    const lines = render('| Name | 值 |\n| --- | :-: |\n| Alpha 😀 | 1 |');
    expect(lines).toEqual([
      '┌──────────┬────┐',
      '│ Name     │ 值 │',
      '├──────────┼────┤',
      '│ Alpha 😀 │ 1  │',
      '└──────────┴────┘',
    ]);
  });

  it('wraps wide CJK cells to the width and separates multi-line rows', () => {
    for (const width of [80, 57, 37]) {
      const lines = render(table, width);
      expectWithin(lines, width);
      const edges = lines.map(visualWidth);
      expect(new Set(edges).size).toBe(1);
    }
    const lines = render(table, 57);
    expect(lines.filter((line) => line.startsWith('├')).length).toBe(2);
    expect(lines.join('')).toContain('第十二届');
  });

  it('lists each row as label/value pairs when the columns cannot fit', () => {
    const header = Array.from({ length: 12 }, (_, index) => `列${index + 1}`);
    const source = [
      `| ${header.join(' | ')} |`,
      `|${' --- |'.repeat(12)}`,
      `| ${header.map((_, index) => `值${index + 1}`).join(' | ')} |`,
      `| ${header.map(() => '').join(' | ')} a |`,
    ].join('\n');
    const lines = render(source, 37);
    expectWithin(lines, 37);
    expect(lines[0]).toBe('列1   值1');
    expect(lines).toContain('列12  值12');
    expect(lines.some((line) => line.startsWith('─'))).toBe(true);
  });
});

describe('plain output', () => {
  it('emits no escape sequences when colors are off', () => {
    chalk.level = 0;
    const source = [
      '# Title',
      '> **Note:** read [this](https://example.com) and `code`',
      '- ~~old~~ *new*',
      '```\nx\n```',
      '| a | b |\n| - | - |\n| 1 | 2 |',
      '---',
    ].join('\n\n');
    const out = renderMarkdown(marked.lexer(source), 60).join('\n');
    expect(out).not.toMatch(/[\u001B\u009B\u009D]/u);
    expect(out).toContain('│ Note: read this (https://example.com) and code');
  });
});
