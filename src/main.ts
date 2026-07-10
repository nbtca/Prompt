import { runStartup } from './core/logo.js';
import { clearScreen, handleGracefulExit } from './core/ui.js';
import { showMainMenu } from './core/menu.js';
import { c } from './core/theme.js';
import { enableVimKeys } from './core/vim-keys.js';
import { checkForUpdate } from './features/update.js';
import { showEventsPreview } from './features/calendar.js';

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
      await runStartup();
    }

    // Fire update check in background; events fetch provides natural wait time
    const updatePromise = checkForUpdate();

    await showEventsPreview();

    // Update check is very likely done by now; give it a short window if not
    const updateMsg = await Promise.race([
      updatePromise,
      new Promise<null>(r => setTimeout(r, 100, null)),
    ]);
    if (updateMsg) console.log(c.warn(updateMsg));

    await showMainMenu();

  } catch (err: unknown) {
    handleGracefulExit(err);
  }
}
