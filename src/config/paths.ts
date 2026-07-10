import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join } from 'path';

function absoluteEnvPath(name: string, fallback: string): string {
  const value = process.env[name];
  return value && isAbsolute(value) ? value : fallback;
}

function getXdgConfigDir(): string {
  const xdgHome = absoluteEnvPath('XDG_CONFIG_HOME', join(homedir(), '.config'));
  return join(xdgHome, 'nbtca');
}

function getLegacyConfigDir(): string {
  return join(homedir(), '.nbtca');
}

function getDefaultStateDir(): string {
  if (process.platform === 'win32' && process.env['LOCALAPPDATA']) {
    return join(process.env['LOCALAPPDATA'], 'nbtca');
  }
  const xdgHome = absoluteEnvPath('XDG_STATE_HOME', join(homedir(), '.local', 'state'));
  return join(xdgHome, 'nbtca');
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

/** User-level runtime state shared by npx, local and global installations. */
export function getStateDir(): string {
  return getDefaultStateDir();
}

export function getWritableStateDir(): string {
  const dir = getDefaultStateDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
