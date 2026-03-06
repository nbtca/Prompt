/**
 * NBTCA Prompt entry point
 */

import chalk from 'chalk';
import { main } from './main.js';
import { runMenuAction, type MenuAction } from './core/menu.js';
import { fetchEvents, renderEventsTable, serializeEvents } from './features/calendar.js';
import { checkServices, countServiceHealth, hasServiceFailures, renderServiceStatusTable, serializeServiceStatus } from './features/status.js';
import { pickIcon } from './core/icons.js';
import { applyColorModePreference } from './config/preferences.js';
import { openDocsInBrowser } from './features/docs.js';
import { runThemeCommand } from './features/theme.js';
import { REPAIR_URL } from './features/repair.js';
import { WEBSITE_URLS } from './features/website.js';
import { setLanguage, t, type Language } from './i18n/index.js';
import { clearScreen } from './core/ui.js';

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
  about: 'about',
  status: 'status',
};

const URL_ACTIONS: Partial<Record<MenuAction, string>> = {
  repair: REPAIR_URL,
  website: WEBSITE_URLS.homepage,
  github: WEBSITE_URLS.github,
  roadmap: WEBSITE_URLS.roadmap
};

interface ParsedArgs {
  command?: string;
  args: string[];
  flags: Set<string>;
}

const KNOWN_FLAGS = new Set(['--help', '--open', '--json', '--plain', '--no-logo', '--watch']);
const KNOWN_FLAG_PREFIXES = ['--interval=', '--timeout=', '--retries='];
const STATUS_WATCH_INTERVAL_MIN = 3;
const STATUS_WATCH_INTERVAL_MAX = 300;
const STATUS_TIMEOUT_MIN = 1000;
const STATUS_TIMEOUT_MAX = 20000;
const STATUS_RETRIES_MIN = 0;
const STATUS_RETRIES_MAX = 5;

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
    args: positionals.slice(1),
    flags
  };
}

function hasInteractiveTerminal(): boolean {
  return !!process.stdin.isTTY && !!process.stdout.isTTY;
}

function getAllowedFlagsFor(command?: string): Set<string> {
  const allowed = new Set(['--help', '--plain']);

  if (!command) {
    allowed.add('--no-logo');
    return allowed;
  }

  if (command === 'lang' || command === 'language') {
    return allowed;
  }
  if (command === 'theme') {
    return allowed;
  }

  const action = ACTION_ALIASES[command];
  if (!action) {
    return allowed;
  }

  switch (action) {
    case 'events':
      allowed.add('--json');
      return allowed;
    case 'status':
      allowed.add('--json');
      allowed.add('--watch');
      return allowed;
    case 'repair':
    case 'website':
    case 'github':
    case 'roadmap':
    case 'docs':
      allowed.add('--open');
      return allowed;
    case 'about':
    default:
      return allowed;
  }
}

function getAllowedFlagPrefixesFor(command?: string): string[] {
  if (!command) return [];
  const action = ACTION_ALIASES[command];
  if (action === 'status') {
    return ['--interval=', '--timeout=', '--retries='];
  }
  return [];
}

function validateFlags(command: string | undefined, flags: Set<string>): void {
  const unknown = Array.from(flags).filter((flag) => {
    if (KNOWN_FLAGS.has(flag)) return false;
    return !KNOWN_FLAG_PREFIXES.some((prefix) => flag.startsWith(prefix));
  });
  if (unknown.length > 0) {
    console.error(chalk.red(`Unknown flag: ${unknown[0]}`));
    console.error(chalk.dim('Run `nbtca --help` to see available flags.'));
    process.exit(1);
  }

  const allowed = getAllowedFlagsFor(command);
  const allowedPrefixes = getAllowedFlagPrefixesFor(command);
  const disallowed = Array.from(flags).filter((flag) => {
    if (allowed.has(flag)) return false;
    return !allowedPrefixes.some((prefix) => flag.startsWith(prefix));
  });
  if (disallowed.length > 0) {
    console.error(chalk.red(`Flag ${disallowed[0]} is not valid for this command.`));
    console.error(chalk.dim('Run `nbtca --help` to see command usage.'));
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(chalk.bold('NBTCA Prompt'));
  console.log();
  console.log('Usage:');
  console.log('  nbtca                          Start interactive menu');
  console.log('  nbtca <command> [flags]        Run one command directly');
  console.log('  nbtca lang <zh|en>             Set language preference');
  console.log('  nbtca theme ...                Configure icon and color mode');
  console.log();
  console.log('Commands:');
  console.log('  events | status | repair | docs | website | github | roadmap | about | theme');
  console.log();
  console.log('Flags:');
  console.log('  --help                         Show help');
  console.log('  --open                         Open browser for URL commands');
  console.log('  --json                         JSON output (supported by `events`, `status`)');
  console.log('  --watch                        Continuously refresh status output (`status` only)');
  console.log('  --interval=<seconds>           Refresh interval for `status --watch` (3-300)');
  console.log('  --timeout=<ms>                HTTP timeout for status checks (1000-20000)');
  console.log('  --retries=<n>                 Retry count for transient status failures (0-5)');
  console.log('  --plain                        Disable color output');
  console.log('  --no-logo                      Skip startup logo in menu mode');
  console.log();
  console.log('Examples:');
  console.log('  nbtca events --json');
  console.log('  nbtca status --json');
  console.log('  nbtca status --watch --interval=10');
  console.log('  nbtca status --timeout=8000 --retries=2');
  console.log('  nbtca theme icon ascii');
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

async function runStatusCommand(flags: Set<string>): Promise<boolean> {
  const trans = t();
  const watch = flags.has('--watch');
  const intervalFlag = Array.from(flags).find((flag) => flag.startsWith('--interval='));
  const timeoutFlag = Array.from(flags).find((flag) => flag.startsWith('--timeout='));
  const retriesFlag = Array.from(flags).find((flag) => flag.startsWith('--retries='));
  const intervalSeconds = intervalFlag ? Number.parseInt(intervalFlag.split('=')[1] || '', 10) : 10;
  const timeoutMs = timeoutFlag ? Number.parseInt(timeoutFlag.split('=')[1] || '', 10) : 6000;
  const retries = retriesFlag ? Number.parseInt(retriesFlag.split('=')[1] || '', 10) : 1;

  if (!watch && intervalFlag) {
    console.error(chalk.red(trans.status.intervalNeedsWatch));
    process.exit(1);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < STATUS_TIMEOUT_MIN || timeoutMs > STATUS_TIMEOUT_MAX) {
    console.error(
      chalk.red(
        trans.status.invalidTimeout
          .replace('{min}', String(STATUS_TIMEOUT_MIN))
          .replace('{max}', String(STATUS_TIMEOUT_MAX))
      )
    );
    process.exit(1);
  }
  if (!Number.isInteger(retries) || retries < STATUS_RETRIES_MIN || retries > STATUS_RETRIES_MAX) {
    console.error(
      chalk.red(
        trans.status.invalidRetries
          .replace('{min}', String(STATUS_RETRIES_MIN))
          .replace('{max}', String(STATUS_RETRIES_MAX))
      )
    );
    process.exit(1);
  }
  if (watch && flags.has('--json')) {
    console.error(chalk.red(trans.status.watchJsonConflict));
    process.exit(1);
  }
  if (
    watch &&
    (!Number.isInteger(intervalSeconds) || intervalSeconds < STATUS_WATCH_INTERVAL_MIN || intervalSeconds > STATUS_WATCH_INTERVAL_MAX)
  ) {
    console.error(
      chalk.red(
        trans.status.invalidInterval
          .replace('{min}', String(STATUS_WATCH_INTERVAL_MIN))
          .replace('{max}', String(STATUS_WATCH_INTERVAL_MAX))
      )
    );
    process.exit(1);
  }
  if (watch && !hasInteractiveTerminal()) {
    console.error(chalk.red(trans.status.watchRequiresTty));
    process.exit(1);
  }

  if (watch) {
    let stopped = false;
    const onSigint = () => {
      stopped = true;
    };
    process.once('SIGINT', onSigint);

    console.log(
      chalk.dim(
        `${trans.status.watchStarted.replace('{seconds}', String(intervalSeconds))} | ${trans.status.watchHint}`
      )
    );

    try {
      while (!stopped) {
        const services = await checkServices({ timeoutMs, retries });
        const hasFailures = hasServiceFailures(services);
        const health = countServiceHealth(services);
        clearScreen();
        console.log(
          chalk.bold(
            `${pickIcon('📡', '[status]')} ${trans.status.watchUpdated}: ${new Date().toLocaleString()}`
          )
        );
        console.log(
          chalk.dim(`${trans.status.up}: ${health.up} | ${trans.status.down}: ${health.down} | ${trans.status.watchHint}`)
        );
        console.log();
        const useColor = !flags.has('--plain') && !!process.stdout.isTTY;
        console.log(renderServiceStatusTable(services, { color: useColor }));
        if (hasFailures) {
          console.log(chalk.yellow(trans.status.summaryFail));
        } else {
          console.log(chalk.green(trans.status.summaryOk));
        }

        await new Promise<void>((resolve) => {
          const stopWait = () => {
            clearTimeout(timer);
            process.removeListener('SIGINT', stopWait);
            resolve();
          };
          const timer = setTimeout(stopWait, intervalSeconds * 1000);
          process.once('SIGINT', stopWait);
          if (stopped) stopWait();
        });
      }
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
    console.log();
    console.log(chalk.dim(t().common.goodbye));
    return true;
  }

  const services = await checkServices({ timeoutMs, retries });
  const hasFailures = hasServiceFailures(services);

  if (flags.has('--json')) {
    process.stdout.write(JSON.stringify(serializeServiceStatus(services), null, 2) + '\n');
  } else {
    const useColor = !flags.has('--plain') && !!process.stdout.isTTY;
    console.log(renderServiceStatusTable(services, { color: useColor }));
    if (hasFailures) {
      console.error(chalk.yellow(t().status.summaryFail));
    } else {
      console.log(chalk.green(t().status.summaryOk));
    }
  }
  return !hasFailures;
}

function maybeDisableColor(flags: Set<string>): void {
  applyColorModePreference(flags.has('--plain'));
}

async function runCommandMode(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv);
  maybeDisableColor(flags);
  validateFlags(command, flags);

  if (flags.has('--help') || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (!command) {
    if (!hasInteractiveTerminal()) {
      console.error(chalk.red('Interactive mode requires a TTY terminal.'));
      console.error(chalk.dim('Use `nbtca --help` for command mode.'));
      process.exit(1);
    }
    await main({ skipLogo: flags.has('--no-logo') });
    return;
  }

  if (command === 'lang' || command === 'language') {
    const language = (args[0] || '').toLowerCase() as Language;
    if (language !== 'zh' && language !== 'en') {
      console.error(chalk.red('Invalid language. Use `zh` or `en`.'));
      process.exit(1);
    }
    const persisted = setLanguage(language);
    if (persisted) {
      console.log(chalk.green(`${pickIcon('✓', 'OK')}: ${t().language.changed}`));
    } else {
      console.log(chalk.yellow(`${pickIcon('⚠', 'WARN')}: ${t().language.changedSessionOnly}`));
    }
    return;
  }

  if (command === 'theme') {
    const result = runThemeCommand(args);
    if (!result.ok) {
      console.error(chalk.red(result.message));
      process.exit(1);
    }
    if (result.message) {
      console.log(chalk.green(`${pickIcon('✓', 'OK')}: ${result.message}`));
    }
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

  if (action === 'status') {
    const ok = await runStatusCommand(flags);
    if (!ok) {
      process.exit(1);
    }
    return;
  }

  if (action === 'docs' && !hasInteractiveTerminal()) {
    if (flags.has('--open')) {
      await openDocsInBrowser();
    } else {
      process.stdout.write(WEBSITE_URLS.docs + '\n');
    }
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
