import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let configHome: string;
let previousConfigHome: string | undefined;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), 'nbtca-i18n-'));
  previousConfigHome = process.env['XDG_CONFIG_HOME'];
  process.env['XDG_CONFIG_HOME'] = configHome;
  vi.resetModules();
});

afterEach(() => {
  if (previousConfigHome === undefined) delete process.env['XDG_CONFIG_HOME'];
  else process.env['XDG_CONFIG_HOME'] = previousConfigHome;
  rmSync(configHome, { recursive: true, force: true });
  vi.resetModules();
});

describe('language state', () => {
  it('changes the active language without writing a preference', async () => {
    const { getCurrentLanguage, setLanguage } = await import('./index.js');

    setLanguage('en');

    expect(getCurrentLanguage()).toBe('en');
    expect(existsSync(join(configHome, 'nbtca', 'language.json'))).toBe(false);
  });

  it('writes the preference only when persistence is requested', async () => {
    const { getCurrentLanguage, saveLanguagePreference } = await import('./index.js');

    expect(saveLanguagePreference('en')).toBe(true);

    expect(getCurrentLanguage()).toBe('en');
    expect(JSON.parse(readFileSync(join(configHome, 'nbtca', 'language.json'), 'utf8'))).toEqual({
      language: 'en',
    });
  });

  it('keeps the requested language active when persistence fails', async () => {
    writeFileSync(join(configHome, 'nbtca'), 'blocked');
    const { getCurrentLanguage, saveLanguagePreference } = await import('./index.js');

    expect(saveLanguagePreference('en')).toBe(false);
    expect(getCurrentLanguage()).toBe('en');
  });
});

describe('translation validation', () => {
  it.each([null, [], { common: null }, { common: [] }])(
    'rejects malformed translation objects',
    async (candidate) => {
      const { validateTranslationShape } = await import('./index.js');

      expect(() => {
        validateTranslationShape(candidate);
      }).toThrow(TypeError);
    },
  );

  it('rejects missing and extra keys', async () => {
    const { validateTranslationShape } = await import('./index.js');
    const reference = { common: { back: 'Back', exit: 'Exit' } };

    expect(() => {
      validateTranslationShape({ common: { back: 'Back' } }, reference);
    }).toThrow(/missing/);
    expect(() => {
      validateTranslationShape(
        { common: { back: 'Back', exit: 'Exit', retry: 'Retry' } },
        reference,
      );
    }).toThrow(/reference translation/);
  });

  it('rejects mismatched leaf types', async () => {
    const { validateTranslationShape } = await import('./index.js');

    expect(() => {
      validateTranslationShape(
        { common: { back: { label: 'Back' } } },
        { common: { back: 'Back' } },
      );
    }).toThrow(/leaf type/);
  });

  it('rejects prototype mutation keys', async () => {
    const { validateTranslationShape } = await import('./index.js');
    const candidate: unknown = JSON.parse('{"common":{"__proto__":"unsafe"}}');

    expect(() => {
      validateTranslationShape(candidate);
    }).toThrow(/unsafe key/);
  });

  it('loads and caches the validated locale pair', async () => {
    const { clearTranslationCache, setLanguage, t } = await import('./index.js');

    clearTranslationCache();
    setLanguage('en');
    expect(t().common.back).toBe('Back');
    setLanguage('zh');
    expect(t().common.back).toBe('返回');
  });
});
