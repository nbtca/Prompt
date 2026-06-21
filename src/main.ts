import { printLogo } from './core/logo.js';
import { clearScreen, handleGracefulExit } from './core/ui.js';
import { showMainMenu } from './core/menu.js';
import { printPanel } from './core/panel.js';
import { c } from './core/theme.js';
import { APP_INFO } from './config/data.js';
import { enableVimKeys } from './core/vim-keys.js';
import { checkForUpdate } from './features/update.js';

export interface MainOptions {
  skipLogo?: boolean;
}

function buildWelcomeContent(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const node = process.version;

  const left  = `${c.heading(APP_INFO.name)}  ${c.version('v' + APP_INFO.version)}`;
  const right = c.muted(`${date}  ·  Node ${node}`);
  const gap   = '   ';

  return `${left}${gap}${right}\n${c.muted(APP_INFO.description)}`;
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

    if (process.stdout.isTTY) {
      printPanel(buildWelcomeContent(), { dim: true });
    }

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
