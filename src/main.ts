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

    // Fire update check in background; events fetch provides natural wait time.
    // Its own AbortController is tied to whichever path finishes first, so a
    // still-in-flight request never keeps the process alive after we're done
    // with (or have stopped caring about) its result.
    const updateAbort = new AbortController();
    const updatePromise = checkForUpdate(updateAbort.signal);

    if (process.stdin.isTTY && process.stdout.isTTY) {
      // Launch app shell for interactive terminals
      const { runApp } = await import('./app/app.js');
      await runApp();
      updateAbort.abort();
    } else {
      // Classic path for non-TTY (CI, pipes, redirects)
      await showEventsPreview();

      try {
        const line = (await import('./features/schedule-view.js')).peekNextClassLine();
        if (line) console.log(line);
      } catch { /* best effort */ }

      // Update check is very likely done by now; give it a short window if not
      const updateMsg = await Promise.race([
        updatePromise,
        new Promise<null>(r => setTimeout(r, 100, null)),
      ]);
      updateAbort.abort();
      if (updateMsg) console.log(c.warn(updateMsg));

      await showMainMenu();
    }

  } catch (err: unknown) {
    handleGracefulExit(err);
  }
}
