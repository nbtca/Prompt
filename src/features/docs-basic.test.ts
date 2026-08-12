import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('keeps task markers lowercase in a basic terminal reader', async () => {
  vi.stubEnv('TERM', 'dumb');
  vi.stubEnv('TERM_PROGRAM', '');
  vi.stubEnv('COLORTERM', '');
  vi.stubEnv('LANG', 'C');
  vi.stubEnv('LC_ALL', 'C');
  vi.stubEnv('NO_COLOR', undefined);
  vi.stubEnv('FORCE_COLOR', '1');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('- [x] Done\n1. [x] Ordered\n- [ ] Pending')),
  );
  const [{ loadDocForReader }, { stripAnsi }] = await Promise.all([
    import('./docs.js'),
    import('../core/text.js'),
  ]);

  const output = (await loadDocForReader('guide/tasks.md')).lines.join('\n');
  const plain = stripAnsi(output);

  expect(output).toContain('[x]');
  expect(plain).toContain('1. [x]');
  expect(output).toContain('[ ]');
  expect(output).not.toContain('[X]');
});
