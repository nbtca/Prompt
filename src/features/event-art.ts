import type { Bitmap } from '../core/pixel-art.js';
import {
  eventIconConference,
  eventIconDefault,
  eventIconMeeting,
  eventIconRepair,
  eventIconWorkshop,
} from '../art/bitmaps.js';

export type EventKind = 'repair' | 'workshop' | 'conference' | 'meeting' | 'birthday' | 'other';

const RULES: readonly (readonly [RegExp, EventKind])[] = [
  [/维修|义诊|修电脑|repair/i, 'repair'],
  [/工作坊|培训|workshop|training|hands-?on/i, 'workshop'],
  [/大会|conference|nwdc|summit|meetup/i, 'conference'],
  [/例会|周会|会议|meeting|standup/i, 'meeting'],
  [/生日|birthday/i, 'birthday'],
];

const ICONS: Readonly<Record<EventKind, Bitmap>> = {
  repair: eventIconRepair,
  workshop: eventIconWorkshop,
  conference: eventIconConference,
  meeting: eventIconMeeting,
  birthday: eventIconDefault,
  other: eventIconDefault,
};

/** Classifies by the title first, then the description, so a description cannot override the title. */
export function eventKind(title: string, description = ''): EventKind {
  for (const text of [title, description]) {
    const rule = RULES.find(([pattern]) => pattern.test(text));
    if (rule) return rule[1];
  }
  return 'other';
}

export function eventIcon(title: string, description = ''): Bitmap {
  return ICONS[eventKind(title, description)];
}
