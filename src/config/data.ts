/**
 * 核心URL配置
 * 集中管理所有外部链接
 */

export const URLS = {
  // 主要链接
  homepage: 'https://nbtca.space',
  github: 'https://github.com/nbtca',
  docs: 'https://docs.nbtca.space',
  repair: 'https://nbtca.space/repair',

  // API链接
  calendar: 'https://ical.nbtca.space',

  // 联系方式
  email: 'contact@nbtca.space'
} as const;

export const APP_INFO = {
  name: 'Prompt',
  version: '1.0.9',
  description: '浙大宁波理工学院计算机协会',
  fullDescription: 'NBTCA Prompt - 极简命令行工具',
  author: 'm1ngsama <contact@m1ng.space>',
  license: 'MIT',
  repository: 'https://github.com/nbtca/prompt'
} as const;
