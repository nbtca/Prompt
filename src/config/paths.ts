import path from 'path';

export function getConfigDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(homeDir, '.nbtca');
}
