import { runStartup } from './core/logo.js';
import { clearScreen } from './core/ui.js';
import { enableVimKeys } from './core/vim-keys.js';

export interface MainOptions {
  skipLogo?: boolean;
}

export async function main(options: MainOptions = {}): Promise<void> {
  enableVimKeys();
  clearScreen();
  if (!options.skipLogo) await runStartup();
  const { runApp } = await import('./app/app.js');
  await runApp();
}
