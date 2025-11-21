/**
 * 极简类型定义
 * 只保留核心类型
 */

/**
 * 菜单项类型
 */
export interface MenuItem {
  name: string;
  value: string;
  description?: string;
  short?: string;
  disabled?: boolean;
}

/**
 * 活动事件类型
 */
export interface Event {
  date: string;
  time: string;
  title: string;
  location: string;
  startDate: Date;
}

/**
 * URL配置类型
 */
export interface URLConfig {
  homepage: string;
  github: string;
  docs: string;
  repair: string;
  calendar: string;
  email: string;
}

/**
 * 应用信息类型
 */
export interface AppInfo {
  name: string;
  version: string;
  description: string;
  fullDescription: string;
  author: string;
  license: string;
  repository: string;
}
