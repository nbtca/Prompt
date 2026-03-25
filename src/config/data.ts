/**
 * 核心URL配置
 * 集中管理所有外部链接
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const URLS = {
  homepage: 'https://nbtca.space',
  github:   'https://github.com/nbtca',
  roadmap:  'https://github.com/orgs/nbtca/projects/5',
  docs:     'https://docs.nbtca.space',
  repair:   'https://nbtca.space/repair',
  calendar: 'https://ical.nbtca.space',
  email:    'contact@nbtca.space',
} as const;

export const GITHUB_REPO = {
  owner: 'nbtca',
  repo: 'documents',
  branch: 'main',
} as const;

export const APP_INFO = {
  name: 'Prompt',
  version: readPackageVersion(),
  description: '浙大宁波理工学院计算机协会',
  fullDescription: 'NBTCA Prompt - 极简命令行工具',
  author: 'm1ngsama <contact@m1ng.space>',
  license: 'MIT',
  repository: 'https://github.com/nbtca/prompt'
} as const;
