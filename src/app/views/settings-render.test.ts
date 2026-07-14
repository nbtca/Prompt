import { describe, it, expect, beforeAll } from 'vitest';
import { renderSettings, type SettingsViewState } from './settings-render.js';
import { ListField } from '../fields/list-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderSettings', () => {
  it('menu mode shows the settings action list', () => {
    const menuField = new ListField({ title: 'Settings', options: [{ value: 'language', label: 'Language' }] });
    const out = stripAnsi(renderSettings({ mode: 'menu', menuField }).join('\n'));
    expect(out).toContain('Language');
  });

  it('a sub-list mode shows its list field', () => {
    const subField = new ListField({ title: 'Language', options: [{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }] });
    const out = stripAnsi(renderSettings({ mode: 'language', subField }).join('\n'));
    expect(out).toContain('English');
  });

  it('about mode shows the about lines and a back field', () => {
    const backField = new ListField({ title: 'About', options: [{ value: '__back__', label: 'Back' }] });
    const out = stripAnsi(renderSettings({ mode: 'about', aboutLines: ['NBTCA Prompt', 'v1.4.0'], backField }).join('\n'));
    expect(out).toContain('NBTCA Prompt');
    expect(out).toContain('Back');
  });
});
