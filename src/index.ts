/**
 * NBTCA Prompt entry point
 */

import chalk from 'chalk';
import { main } from './main.js';
import { runMenuAction, type MenuAction } from './core/menu.js';
import { fetchEvents, renderEventsTable, serializeEvents } from './features/calendar.js';
import { REPAIR_URL } from './features/repair.js';
import { WEBSITE_URLS } from './features/website.js';
import { setLanguage, t, type Language } from './i18n/index.js';

const ACTION_ALIASES: Record<string, MenuAction> = {
  events: 'events',
  event: 'events',
  repair: 'repair',
  docs: 'docs',
  doc: 'docs',
  website: 'website',
  web: 'website',
  github: 'github',
  gh: 'github',
  roadmap: 'roadmap',
  board: 'roadmap',
  about: 'about'
};

const URL_ACTIONS: Partial<Record<MenuAction, string>> = {
  repair: REPAIR_URL,
  website: WEBSITE_URLS.homepage,
  github: WEBSITE_URLS.github,
  roadmap: WEBSITE_URLS.roadmap
};

interface ParsedArgs {
  command?: string;
  arg?: string;
  flags: Set<string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (const token of argv) {
    if (token.startsWith('--')) {
      flags.add(token);
    } else {
      positionals.push(token);
    }
  }

  return {
    command: positionals[0]?.toLowerCase(),
    arg: positionals[1],
    flags
  };
}

function printHelp(): void {
  console.log(chalk.bold('NBTCA Prompt'));
  console.log();
  console.log('Usage:');
  console.log('  nbtca                          Start interactive menu');
  console.log('  nbtca <command> [flags]        Run one command directly');
  console.log('  nbtca lang <zh|en>             Set language preference');
  console.log();
  console.log('Commands:');
  console.log('  events | repair | docs | website | github | roadmap | about');
  console.log();
  console.log('Flags:');
  console.log('  --help                         Show help');
  console.log('  --open                         Open browser for URL commands');
  console.log('  --json                         JSON output (supported by `events`)');
  console.log('  --plain                        Disable color output');
  console.log('  --no-logo                      Skip startup logo in menu mode');
  console.log();
  console.log('Examples:');
  console.log('  nbtca events --json');
  console.log('  nbtca roadmap');
  console.log('  nbtca roadmap --open');
}

async function runEventsCommand(flags: Set<string>): Promise<void> {
  const events = await fetchEvents();

  if (flags.has('--json')) {
    process.stdout.write(JSON.stringify(serializeEvents(events), null, 2) + '\n');
    return;
  }

  const useColor = !flags.has('--plain') && !!process.stdout.isTTY;
  console.log(renderEventsTable(events, { color: useColor }));
}

function maybeDisableColor(flags: Set<string>): void {
  if (flags.has('--plain')) {
    process.env['NO_COLOR'] = '1';
  }
}

async function runCommandMode(argv: string[]): Promise<void> {
  const { command, arg, flags } = parseArgs(argv);
  maybeDisableColor(flags);

  if (flags.has('--help') || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (!command) {
    await main({ skipLogo: flags.has('--no-logo') });
    return;
  }

  if (command === 'lang' || command === 'language') {
    const language = (arg || '').toLowerCase() as Language;
    if (language !== 'zh' && language !== 'en') {
      console.error(chalk.red('Invalid language. Use `zh` or `en`.'));
      process.exit(1);
    }
    setLanguage(language);
    console.log(chalk.green(`✓ ${t().language.changed}`));
    return;
  }

  const action = ACTION_ALIASES[command];
  if (!action) {
    console.error(chalk.red(`Unknown command: ${command}`));
    console.error(chalk.dim('Run `nbtca --help` to see available commands.'));
    process.exit(1);
  }

  if (action === 'events') {
    await runEventsCommand(flags);
    return;
  }

  const mappedUrl = URL_ACTIONS[action];
  if (mappedUrl && !flags.has('--open')) {
    process.stdout.write(mappedUrl + '\n');
    return;
  }

  await runMenuAction(action);
}

runCommandMode(process.argv.slice(2)).catch((err: any) => {
  if (err?.message?.includes('SIGINT') || err?.message?.includes('User force closed')) {
    console.log();
    console.log(chalk.dim(t().common.goodbye));
    process.exit(0);
  }

  if (err?.message) {
    console.error(err.message);
  } else {
    console.error('Error occurred:', err);
  }
  process.exit(1);
});
