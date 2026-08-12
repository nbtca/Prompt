import { describe, expect, it } from 'vitest';
import { getCurrentLanguage, setLanguage } from '../i18n/index.js';
import { getAppTabs } from './tabs.js';

describe('getAppTabs', () => {
  it('reads translated labels again after the language changes', () => {
    const original = getCurrentLanguage();
    try {
      setLanguage('zh');
      expect(getAppTabs().map((tab) => tab.title)).toEqual([
        'Home',
        '课表',
        '活动',
        '文档',
        '设置',
      ]);

      setLanguage('en');
      expect(getAppTabs().map((tab) => tab.title)).toEqual([
        'Home',
        'Schedule',
        'Events',
        'Docs',
        'Settings',
      ]);
    } finally {
      setLanguage(original);
    }
  });
});
