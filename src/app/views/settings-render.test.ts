import { describe, it, expect, beforeAll } from 'vitest';
import { renderSettings, type SettingsViewState } from './settings-render.js';
import { ListField } from '../fields/list-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi, visualWidth } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderSettings', () => {
  it('menu mode shows the settings action list', () => {
    const menuField = new ListField({
      title: 'Settings',
      options: [{ value: 'language', label: 'Language' }],
    });
    const out = stripAnsi(renderSettings({ mode: 'menu', menuField }).join('\n'));
    expect(out).toContain('Language');
  });

  it('a sub-list mode shows its list field', () => {
    const subField = new ListField({
      title: 'Language',
      options: [
        { value: 'zh', label: '简体中文' },
        { value: 'en', label: 'English' },
      ],
    });
    const out = stripAnsi(renderSettings({ mode: 'language', subField }).join('\n'));
    expect(out).toContain('English');
  });

  it('about mode shows the about lines and a back field', () => {
    const backField = new ListField({
      title: 'About',
      options: [{ value: '__back__', label: 'Back' }],
    });
    const out = stripAnsi(
      renderSettings({ mode: 'about', aboutLines: ['NBTCA Prompt', 'v1.4.0'], backField }).join(
        '\n',
      ),
    );
    expect(out).toContain('NBTCA Prompt');
    expect(out).toContain('Back');
  });

  it('keeps the back action visible in a five-row body', () => {
    const backField = new ListField({
      title: 'About',
      options: [{ value: '__back__', label: 'Back' }],
    });
    const lines = renderSettings(
      {
        mode: 'about',
        aboutLines: ['Project', 'Version', 'Description', '', 'Repository', 'Website'],
        backField,
      },
      5,
    );

    expect(stripAnsi(lines.slice(0, 5).join('\n'))).toContain('Back');
  });

  it.each([
    ['Community governance and operations', 'Current'],
    ['社区治理与组织协作运行机制', '当前'],
  ])('fits every settings list within twenty columns', (label, hint) => {
    const createField = () =>
      new ListField({
        title: 'Settings',
        options: [{ value: 'item', label, hint }],
      });
    const states: SettingsViewState[] = [
      { mode: 'menu', menuField: createField() },
      { mode: 'language', subField: createField() },
      { mode: 'icon', subField: createField() },
      { mode: 'color', subField: createField() },
      { mode: 'about', aboutLines: [], backField: createField() },
    ];

    for (const state of states) {
      const lines = renderSettings(state, 6, 20);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines.length).toBeLessThanOrEqual(6);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(text).toContain(label.replace(/\s/g, ''));
      expect(text).toContain(hint);
      expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
    }
  });

  it.each([
    ['Preferences were reset for this terminal session', 'Open settings'],
    ['偏好设置仅在当前终端会话中完成重置', '打开设置'],
  ])(
    'fits a status message and action within seven rows and twenty columns',
    (statusMessage, label) => {
      const menuField = new ListField({
        title: 'Settings',
        options: [{ value: 'open', label }],
      });
      const lines = renderSettings({ mode: 'menu', statusMessage, menuField }, 7, 20);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines.length).toBeLessThanOrEqual(7);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(text).toContain(statusMessage.replace(/\s/g, ''));
      expect(text).toContain(label.replace(/\s/g, ''));
      expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
    },
  );

  it.each([
    ['Repository  https://github.com/nbtca/Prompt', 'Back'],
    ['项目说明  面向社区成员的终端交互入口', '返回'],
  ])('reflows a complete about row without hiding its action', (info, label) => {
    const backField = new ListField({
      title: 'About',
      options: [{ value: '__back__', label }],
    });
    const lines = renderSettings({ mode: 'about', aboutLines: [info], backField }, 7, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(7);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(info.replace(/\s/g, ''));
    expect(text).toContain(label);
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it('keeps every about row scrollable while the back action starts visible', () => {
    const aboutLines = [
      'Project  NBTCA Prompt',
      'Version  v1.4.0',
      'Description  Terminal community interface',
      'Repository  https://github.com/nbtca/Prompt',
      'Website  nbtca.space',
      'Email  hi@nbtca.space',
      'License  MIT',
    ];
    const backField = new ListField({
      title: 'About',
      options: [{ value: '__back__', label: 'Back' }],
    });
    const lines = renderSettings({ mode: 'about', aboutLines, backField }, 5, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeGreaterThan(5);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(stripAnsi(lines.slice(0, 5).join('\n'))).toContain('Back');
    for (const line of aboutLines) expect(text).toContain(line.replace(/\s/g, ''));
  });
});
