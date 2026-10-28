import type { Bitmap } from '../core/pixel-art.js';
import {
  eventIconConference,
  eventIconDefault,
  eventIconMeeting,
  eventIconRepair,
  eventIconWorkshop,
} from '../art/bitmaps.js';

const RULES: readonly (readonly [RegExp, Bitmap])[] = [
  [/维修|义诊|修电脑|repair/i, eventIconRepair],
  [/工作坊|培训|workshop|training|hands-?on/i, eventIconWorkshop],
  [/大会|conference|nwdc|summit|meetup/i, eventIconConference],
  [/例会|周会|会议|meeting|standup/i, eventIconMeeting],
];

/** Picks the picture from the title first, then the description, so a description cannot override the title. */
export function eventIcon(title: string, description = ''): Bitmap {
  for (const text of [title, description]) {
    const rule = RULES.find(([pattern]) => pattern.test(text));
    if (rule) return rule[1];
  }
  return eventIconDefault;
}
