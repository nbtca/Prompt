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
    expect(JSON.parse(readFileSync(join(configHome, 'nbtca', 'language.json'), 'utf8'))).toEqual({ language: 'en' });
  });

  it('keeps the requested language active when persistence fails', async () => {
    writeFileSync(join(configHome, 'nbtca'), 'blocked');
    const { getCurrentLanguage, saveLanguagePreference } = await import('./index.js');

    expect(saveLanguagePreference('en')).toBe(false);
    expect(getCurrentLanguage()).toBe('en');
  });
});
