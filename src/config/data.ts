import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as unknown;
    if (typeof pkg !== 'object' || pkg === null) return '0.0.0';
    const version = (pkg as Record<string, unknown>)['version'];
    return typeof version === 'string' ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const URLS = {
  homepage: 'https://nbtca.space',
  github: 'https://github.com/nbtca',
  roadmap: 'https://github.com/orgs/nbtca/projects/5',
  docs: 'https://docs.nbtca.space',
  repair: 'https://nbtca.space/repair',
  calendar: 'https://ical.nbtca.space',
  email: 'contact@nbtca.space',
  cloud: 'https://cloud.nbtca.space',
  mirror: 'https://i.nbtca.space',
} as const;

export const APP_INFO = {
  name: 'Prompt',
  version: readPackageVersion(),
  description: 'NBTCA community',
  author: 'm1ngsama <contact@m1ng.space>',
  license: 'MIT',
  repository: 'https://github.com/nbtca/Prompt',
} as const;
