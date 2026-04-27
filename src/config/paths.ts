import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function getXdgConfigDir(): string {
  const xdgHome = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
  return join(xdgHome, 'nbtca');
}

function getLegacyConfigDir(): string {
  return join(homedir(), '.nbtca');
}

export function getConfigDir(): string {
  const xdgDir = getXdgConfigDir();
  if (existsSync(xdgDir)) return xdgDir;

  const legacyDir = getLegacyConfigDir();
  if (existsSync(legacyDir)) return legacyDir;

  return xdgDir;
}

export function getWritableConfigDir(): string {
  const dir = getXdgConfigDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
