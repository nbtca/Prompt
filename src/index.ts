/**
 * NBTCA Welcome Tool - Entry Point
 */

import chalk from 'chalk';
import { main } from './main.js';
import { runMenuAction, type MenuAction } from './core/menu.js';
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

function printHelp(): void {
  console.log(chalk.bold('NBTCA Prompt'));
  console.log();
  console.log('Usage:');
  console.log('  nbtca                      Start interactive menu');
  console.log('  nbtca <command>            Run one command directly');
  console.log('  nbtca lang <zh|en>         Set language preference');
  console.log('  nbtca --help               Show this help');
  console.log();
  console.log('Commands: events, repair, docs, website, github, roadmap, about');
}

async function runCommandMode(argv: string[]): Promise<void> {
  const [rawCommand, rawArg] = argv;
  const command = (rawCommand || '').toLowerCase();

  if (!command) {
    await main();
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'lang' || command === 'language') {
    const language = (rawArg || '').toLowerCase() as Language;
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
    console.log(chalk.dim('Run `nbtca --help` to see available commands.'));
    process.exit(1);
  }

  await runMenuAction(action);
}

runCommandMode(process.argv.slice(2)).catch((err: any) => {
  if (err?.message?.includes('SIGINT') || err?.message?.includes('User force closed')) {
    console.log();
    console.log(chalk.dim(t().common.goodbye));
    process.exit(0);
  }
  console.error('Error occurred:', err);
  process.exit(1);
});
