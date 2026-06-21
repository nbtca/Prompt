import { printLogo } from './core/logo.js';
import { clearScreen, handleGracefulExit } from './core/ui.js';
import { showMainMenu } from './core/menu.js';
import { c } from './core/theme.js';
import { enableVimKeys } from './core/vim-keys.js';
import { checkForUpdate } from './features/update.js';

export interface MainOptions {
  skipLogo?: boolean;
}

export async function main(options: MainOptions = {}): Promise<void> {
  try {
    enableVimKeys();

    if (process.stdout.isTTY) {
      clearScreen();
    }

    if (!options.skipLogo) {
      printLogo();
    }

    const updatePromise = checkForUpdate();

    const updateMsg = await Promise.race([
      updatePromise,
      new Promise<null>(r => setTimeout(r, 500, null)),
    ]);
    if (updateMsg) console.log(c.warn(updateMsg));

    await showMainMenu();

  } catch (err: unknown) {
    handleGracefulExit(err);
  }
}
