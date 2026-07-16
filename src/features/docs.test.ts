import { describe, it, expect } from 'vitest';
import { cleanFileName, displayDocTitle } from './docs.js';

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
