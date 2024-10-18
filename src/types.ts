/**
 * Type definitions for NBTCA Welcome.
 */

/**
 * RGB Color type.
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Service item with URL.
 */
export interface ServiceWithUrl {
  url: string;
  title: string;
  description: string;
  features?: string[];
  categories?: string[];
  upcoming?: string[];
  members?: string[];
  info?: string[];
}

/**
 * Official website services data structure.
 */
export interface OfficialData {
  homepage: ServiceWithUrl;
  news: ServiceWithUrl;
  events: ServiceWithUrl;
  team: ServiceWithUrl;
  contact: ServiceWithUrl;
}

/**
 * Technical support service structure.
 */
export interface TechService {
  title: string;
  description: string;
  services: string[];
  contact: string;
  location: string;
  hours: string;
  price: string;
  url?: string;
}

/**
 * Technical support services data structure.
 */
export interface TechData {
  repair: TechService;
  software: TechService;
  network: TechService;
  mobile: TechService;
  hardware: TechService;
  booking: TechService & { url: string };
}

/**
 * Learning resource structure.
 */
export interface LearningResource {
  title: string;
  url: string;
  description: string;
  categories?: string[];
  features?: string[];
  levels?: string[];
  resources?: string[];
  topics?: string[];
  journals?: string[];
  books?: string[];
}

/**
 * Learning resources data structure.
 */
export interface LearningData {
  docs: LearningResource;
  videos: LearningResource;
  coding: LearningResource;
  design: LearningResource;
  research: LearningResource;
  books: LearningResource;
}

/**
 * Community resource structure.
 */
export interface CommunityResource {
  title: string;
  description: string;
  url?: string;
  platforms?: string[];
  groups?: string[];
  projects?: string[];
  content?: string[];
  types?: string[];
  contests?: string[];
}

/**
 * Community data structure.
 */
export interface CommunityData {
  forum: CommunityResource;
  qq: CommunityResource;
  github: CommunityResource;
  wechat: CommunityResource;
  projects: CommunityResource;
  contests: CommunityResource;
}

/**
 * Settings option structure.
 */
export interface SettingsOption {
  title: string;
  description: string;
  options?: string[];
  settings?: string[];
  monitors?: string[];
  preferences?: string[];
}

/**
 * Settings data structure.
 */
export interface SettingsData {
  theme: SettingsOption;
  network: SettingsOption;
  performance: SettingsOption;
  notifications: SettingsOption;
  updates: SettingsOption;
}

/**
 * Help resource structure.
 */
export interface HelpResource {
  title: string;
  description: string;
  topics?: string[];
  questions?: string[];
  channels?: string[];
  items?: string[];
}

/**
 * Help data structure.
 */
export interface HelpData {
  guide: HelpResource;
  faq: HelpResource;
  feedback: HelpResource;
  terms: HelpResource;
  privacy: HelpResource;
  about: HelpResource;
}

/**
 * System information structure.
 */
export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  memory: {
    total: number;
    free: number;
    used: number;
  };
  cpu: {
    model: string;
    cores: number;
  };
  uptime: number;
}

/**
 * Theme configuration structure.
 */
export interface ThemeConfig {
  name: string;
  primary: RGBColor;
  secondary: RGBColor;
  accent: RGBColor;
  background: RGBColor;
  text: RGBColor;
}

/**
 * Menu choice structure for Inquirer.
 */
export interface MenuChoice {
  name: string;
  value: string;
}

/**
 * Action types for menu navigation.
 */
export type MenuAction =
  | 'official'
  | 'tech'
  | 'learning'
  | 'community'
  | 'settings'
  | 'help'
  | 'exit'
  | 'back';

/**
 * Sub-menu action types.
 */
export type OfficialAction = 'homepage' | 'news' | 'events' | 'team' | 'contact' | 'back';
export type TechAction = 'repair' | 'software' | 'network' | 'mobile' | 'hardware' | 'booking' | 'back';
export type LearningAction = 'docs' | 'videos' | 'coding' | 'design' | 'research' | 'books' | 'back';
export type CommunityAction = 'forum' | 'qq' | 'github' | 'wechat' | 'projects' | 'contests' | 'back';
export type SettingsAction = 'theme' | 'network' | 'performance' | 'notifications' | 'updates' | 'back';
export type HelpAction = 'guide' | 'faq' | 'feedback' | 'terms' | 'privacy' | 'about' | 'back';

/**
 * Animation effect types.
 */
export type AnimationEffect = 'rainbow' | 'wave' | 'pulse' | 'gradient';

/**
 * Spinner types for loading animations.
 */
export type SpinnerType = 'dots' | 'line' | 'arrow' | 'nbtca';

/**
 * Border style types.
 */
export type BorderStyle = 'line' | 'dashed' | 'dotted' | 'star';
