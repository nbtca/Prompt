import { describe, it, expect } from 'vitest';
import { eventIcon } from './event-art.js';
import {
  eventIconConference,
  eventIconDefault,
  eventIconMeeting,
  eventIconRepair,
  eventIconWorkshop,
} from '../art/bitmaps.js';

describe('eventIcon', () => {
  it.each([
    ['电脑义诊', eventIconRepair],
    ['Git 工作坊', eventIconWorkshop],
    ['NWDC 杭州线下活动', eventIconConference],
    ['开发部例会：统计社团基础设施', eventIconMeeting],
    ['Weekly meeting', eventIconMeeting],
    ['新生交流', eventIconDefault],
  ])('maps %s', (title, icon) => {
    expect(eventIcon(title)).toBe(icon);
  });

  it('reads the description only when the title says nothing', () => {
    expect(eventIcon('周六活动', '现场维修笔记本')).toBe(eventIconRepair);
    expect(eventIcon('Git 工作坊', '会后有例会')).toBe(eventIconWorkshop);
  });
});
