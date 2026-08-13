import chalk from 'chalk';
import { main } from './main.js';
import {
  fetchEvents,
  fetchHeatmapBuckets,
  renderEventsTable,
  serializeEvents,
  type Event,
} from './features/calendar.js';
import { renderHeatmap } from './features/calendar-heatmap.js';
import {
  checkServices,
  countServiceHealth,
  hasServiceFailures,
  renderServiceStatusTable,
  serializeServiceStatus,
} from './features/status.js';
import { pickIcon } from './core/icons.js';
import { applyColorModePreference } from './config/preferences.js';
import { openDocsInBrowser } from './features/docs.js';
import { runThemeCommand } from './features/theme.js';
import { saveLanguagePreference, t, fmt } from './i18n/index.js';
import { clearScreen, handleGracefulExit } from './core/ui.js';
import { APP_INFO, URLS } from './config/data.js';
import { runUpdateCheck } from './features/update.js';
import { runStudentTimetableCommand } from './features/student-timetable.js';
import { showAbout } from './features/about.js';
import { openUrlInBrowser } from './features/links.js';

type CliAction =
  'events' | 'status' | 'docs' | 'repair' | 'website' | 'github' | 'roadmap' | 'about';

const ACTION_ALIASES: Record<string, CliAction> = {
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

const URL_ACTIONS: Partial<Record<CliAction, string>> = {
  repair: URLS.repair,
  website: URLS.homepage,
  github: URLS.github,
  roadmap: URLS.roadmap,
};

interface ParsedArgs {
  command?: string;
  args: string[];
  flags: Set<string>;
}

const KNOWN_FLAGS = new Set([
  '--help',
  '--version',
  '--open',
  '--json',
  '--plain',
  '--no-logo',
  '--watch',
  '--today',
  '--heatmap',
  '--week',
  '--month',
  '--one-shot',
  '--no-save',
]);
const KNOWN_FLAG_PREFIXES = [
  '--interval=',
  '--timeout=',
  '--retries=',
  '--next=',
  '--search=',
  '--term=',
  '--output=',
  '--week-one=',
];
const STATUS_WATCH_INTERVAL_MIN = 3;
const STATUS_WATCH_INTERVAL_MAX = 300;
const STATUS_TIMEOUT_MIN = 1000;
const STATUS_TIMEOUT_MAX = 20000;
const STATUS_RETRIES_MIN = 0;
const STATUS_RETRIES_MAX = 5;
const ASCII_DECIMAL_INTEGER = /^[0-9]+$/;

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
    ...(positionals[0] === undefined ? {} : { command: positionals[0].toLowerCase() }),
    args: positionals.slice(1),
    flags,
  };
}

function isTty(value: unknown): boolean {
  return value === true;
}

function parseAsciiDecimalInteger(value: string): number | undefined {
  if (!ASCII_DECIMAL_INTEGER.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function terminalWidth(): number | undefined {
  const stdoutColumns = process.stdout.columns;
  if (typeof stdoutColumns === 'number' && Number.isFinite(stdoutColumns) && stdoutColumns > 0) {
    return Math.floor(stdoutColumns);
  }

  const environmentColumns = process.env['COLUMNS'];
  if (environmentColumns === undefined) return undefined;
  const parsed = parseAsciiDecimalInteger(environmentColumns);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function hasInteractiveTerminal(): boolean {
  return isTty(process.stdin.isTTY) && isTty(process.stdout.isTTY);
}

function getAllowedFlagsFor(command?: string): Set<string> {
  const allowed = new Set(['--help', '--plain']);

  if (!command) {
    allowed.add('--no-logo');
    allowed.add('--version');
    return allowed;
  }

  if (command === 'lang' || command === 'language') return allowed;
  if (command === 'theme') return allowed;
  if (command === 'schedule' || command === 'timetable') {
    allowed.add('--one-shot');
    allowed.add('--no-save');
    return allowed;
  }

  const action = ACTION_ALIASES[command];
  if (!action) return allowed;

  switch (action) {
    case 'events':
      allowed.add('--json');
      allowed.add('--today');
      allowed.add('--heatmap');
      allowed.add('--week');
      allowed.add('--month');
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
  if (command === 'schedule' || command === 'timetable') {
    return ['--term=', '--output=', '--week-one='];
  }
  const action = ACTION_ALIASES[command];
  if (action === 'events') return ['--next=', '--search='];
  if (action === 'status') return ['--interval=', '--timeout=', '--retries='];
  return [];
}

function validateFlags(command: string | undefined, flags: Set<string>): void {
  const unknownFlag = Array.from(flags).find((flag) => {
    if (KNOWN_FLAGS.has(flag)) return false;
    return !KNOWN_FLAG_PREFIXES.some((prefix) => flag.startsWith(prefix));
  });
  if (unknownFlag) {
    const trans0 = t();
    console.error(chalk.red(fmt(trans0.cli.unknownFlag, { flag: unknownFlag })));
    console.error(chalk.dim(trans0.cli.unknownFlagHint));
    process.exit(1);
  }

  const allowed = getAllowedFlagsFor(command);
  const allowedPrefixes = getAllowedFlagPrefixesFor(command);
  const disallowedFlag = Array.from(flags).find((flag) => {
    if (allowed.has(flag)) return false;
    return !allowedPrefixes.some((prefix) => flag.startsWith(prefix));
  });
  if (disallowedFlag) {
    const trans1 = t();
    console.error(chalk.red(fmt(trans1.cli.invalidFlag, { flag: disallowedFlag })));
    console.error(chalk.dim(trans1.cli.invalidFlagHint));
    process.exit(1);
  }
}

function rejectUnexpectedArguments(command: string, args: string[]): void {
  if (args.length === 0) return;
  const trans = t().cli;
  console.error(chalk.red(fmt(trans.unexpectedArguments, { command })));
  console.error(chalk.dim(trans.invalidFlagHint));
  process.exit(1);
}

function printHelp(): void {
  const trans = t();
  const c = trans.cli;
  console.log(chalk.bold('NBTCA Prompt'));
  console.log();
  console.log(c.usage);
  console.log(`  nbtca                          ${c.interactive}`);
  console.log(`  nbtca <command> [flags]         ${c.runCommand}`);
  console.log();
  console.log(c.commands);
  console.log(`  events         ${trans.menu.eventsDesc}`);
  console.log(`  docs           ${trans.menu.docsDesc}`);
  console.log(`  status         ${trans.menu.statusDesc}`);
  console.log('  schedule <login|logout|status|terms|export>');
  console.log(`                 ${c.cmdSchedule}`);
  console.log(`  website        ${c.cmdWebsite}`);
  console.log(`  github         ${c.cmdGithub}`);
  console.log(`  roadmap        ${c.cmdRoadmap}`);
  console.log(`  repair         ${c.cmdRepair}`);
  console.log(`  theme          ${c.cmdTheme}`);
  console.log(`  lang <zh|en>   ${c.cmdLang}`);
  console.log(`  update         ${c.cmdUpdate}`);
  console.log();
  console.log(c.flags);
  console.log(`  --version          ${c.flagVersion}`);
  console.log(`  --help             ${c.flagHelp}`);
  console.log(`  --open             ${c.flagOpen}`);
  console.log(`  --json             ${c.flagJson}`);
  console.log(`  --heatmap          ${c.flagHeatmap}`);
  console.log(`  --today            ${c.flagToday}`);
  console.log(`  --week             ${c.flagWeek}`);
  console.log(`  --month            ${c.flagMonth}`);
  console.log(`  --search=<q>       ${c.flagSearch}`);
  console.log(`  --next=<n>         ${c.flagNext}`);
  console.log(`  --watch            ${c.flagWatch}`);
  console.log(`  --interval=<s>     ${c.flagInterval}`);
  console.log(`  --timeout=<ms>     ${c.flagTimeout}`);
  console.log(`  --retries=<n>      ${c.flagRetries}`);
  console.log(`  --plain            ${c.flagPlain}`);
  console.log(`  --no-logo          ${c.flagNoLogo}`);
  console.log(`  --one-shot         ${c.flagOneShot}`);
  console.log(`  --no-save          ${c.flagNoSave}`);
  console.log(`  --term=<year:code> ${c.flagTerm}`);
  console.log(`  --output=<path>    ${c.flagOutput}`);
  console.log(`  --week-one=<date>  ${c.flagWeekOne}`);
}

async function runEventsCommand(flags: Set<string>): Promise<void> {
  const searchFlag = Array.from(flags).find((flag) => flag.startsWith('--search='));
  const nextFlag = Array.from(flags).find((flag) => flag.startsWith('--next='));
  const rangeFlags = ['--today', '--week', '--month'].filter((flag) => flags.has(flag));
  if (
    flags.has('--heatmap') &&
    (rangeFlags.length > 0 || nextFlag !== undefined || searchFlag !== undefined)
  ) {
    console.error(chalk.red(t().cli.eventsHeatmapConflict));
    process.exit(1);
  }
  if (rangeFlags.length > 1) {
    console.error(chalk.red(t().cli.eventsRangeConflict));
    process.exit(1);
  }

  const next = nextFlag ? parseAsciiDecimalInteger(nextFlag.slice('--next='.length)) : undefined;
  if (nextFlag && (next === undefined || next < 1)) {
    console.error(chalk.red(t().cli.invalidNext));
    process.exit(1);
  }

  if (flags.has('--heatmap')) {
    const buckets = await fetchHeatmapBuckets();
    if (flags.has('--json')) {
      process.stdout.write(JSON.stringify(buckets, null, 2) + '\n');
    } else {
      const useColor = !flags.has('--plain') && isTty(process.stdout.isTTY);
      console.log(renderHeatmap(buckets, new Date(), { color: useColor }));
    }
    return;
  }

  const { weekRange, monthRange } = await import('./features/calendar-query.js');
  const { fetchInRange } = await import('./features/calendar.js');
  const now0 = new Date();
  let events: Event[];
  if (flags.has('--week')) {
    const r = weekRange(now0);
    events = await fetchInRange(r.start, r.end);
  } else if (flags.has('--month')) {
    const r = monthRange(now0);
    events = await fetchInRange(r.start, r.end);
  } else {
    events = await fetchEvents();
  }

  if (searchFlag) {
    const q = searchFlag.slice('--search='.length).toLowerCase();
    events = events.filter((e) => `${e.title} ${e.location}`.toLowerCase().includes(q));
  }

  if (flags.has('--today')) {
    const now = new Date();
    events = events.filter((e) => {
      const d = e.startDate;
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
  }

  if (next !== undefined) events = events.slice(0, next);

  if (flags.has('--json')) {
    process.stdout.write(JSON.stringify(serializeEvents(events), null, 2) + '\n');
    return;
  }

  const useColor = !flags.has('--plain') && isTty(process.stdout.isTTY);
  const width = terminalWidth();
  console.log(
    renderEventsTable(events, {
      color: useColor,
      ...(width === undefined ? {} : { width }),
    }),
  );
}

async function runStatusCommand(flags: Set<string>): Promise<boolean> {
  const trans = t();
  const watch = flags.has('--watch');
  const intervalFlag = Array.from(flags).find((flag) => flag.startsWith('--interval='));
  const timeoutFlag = Array.from(flags).find((flag) => flag.startsWith('--timeout='));
  const retriesFlag = Array.from(flags).find((flag) => flag.startsWith('--retries='));
  const intervalSeconds = intervalFlag
    ? parseAsciiDecimalInteger(intervalFlag.slice('--interval='.length))
    : 10;
  const timeoutMs = timeoutFlag
    ? parseAsciiDecimalInteger(timeoutFlag.slice('--timeout='.length))
    : 6000;
  const retries = retriesFlag
    ? parseAsciiDecimalInteger(retriesFlag.slice('--retries='.length))
    : 1;

  if (!watch && intervalFlag) {
    console.error(chalk.red(trans.status.intervalNeedsWatch));
    process.exit(1);
  }
  if (timeoutMs === undefined || timeoutMs < STATUS_TIMEOUT_MIN || timeoutMs > STATUS_TIMEOUT_MAX) {
    console.error(
      chalk.red(
        fmt(trans.status.invalidTimeout, { min: STATUS_TIMEOUT_MIN, max: STATUS_TIMEOUT_MAX }),
      ),
    );
    process.exit(1);
  }
  if (retries === undefined || retries < STATUS_RETRIES_MIN || retries > STATUS_RETRIES_MAX) {
    console.error(
      chalk.red(
        fmt(trans.status.invalidRetries, { min: STATUS_RETRIES_MIN, max: STATUS_RETRIES_MAX }),
      ),
    );
    process.exit(1);
  }
  if (watch && flags.has('--json')) {
    console.error(chalk.red(trans.status.watchJsonConflict));
    process.exit(1);
  }
  if (watch) {
    if (
      intervalSeconds === undefined ||
      intervalSeconds < STATUS_WATCH_INTERVAL_MIN ||
      intervalSeconds > STATUS_WATCH_INTERVAL_MAX
    ) {
      console.error(
        chalk.red(
          fmt(trans.status.invalidInterval, {
            min: STATUS_WATCH_INTERVAL_MIN,
            max: STATUS_WATCH_INTERVAL_MAX,
          }),
        ),
      );
      process.exit(1);
    }
    if (!hasInteractiveTerminal()) {
      console.error(chalk.red(trans.status.watchRequiresTty));
      process.exit(1);
    }

    const stopController = new AbortController();
    const isStopped = () => stopController.signal.aborted;
    const onSigint = () => {
      process.exitCode = 130;
      stopController.abort();
    };
    process.once('SIGINT', onSigint);

    console.log(
      chalk.dim(
        `${fmt(trans.status.watchStarted, { seconds: intervalSeconds })} | ${trans.status.watchHint}`,
      ),
    );

    try {
      while (!isStopped()) {
        let services;
        try {
          services = await checkServices({ timeoutMs, retries, signal: stopController.signal });
        } catch (error) {
          if (isStopped()) break;
          throw error;
        }
        if (isStopped()) break;
        const hasFailures = hasServiceFailures(services);
        const hasIntranetFailures = services.some((service) => service.intranet && !service.ok);
        const health = countServiceHealth(services);
        clearScreen();
        console.log(chalk.bold(`${trans.status.watchUpdated}: ${new Date().toLocaleString()}`));
        console.log(
          chalk.dim(
            `${trans.status.up}: ${health.up} | ${trans.status.down}: ${health.down} | ${trans.status.watchHint}`,
          ),
        );
        console.log();
        const useColor = !flags.has('--plain') && isTty(process.stdout.isTTY);
        console.log(renderServiceStatusTable(services, { color: useColor }));
        if (hasFailures) {
          console.log(chalk.yellow(trans.status.summaryFail));
        } else if (hasIntranetFailures) {
          console.log(chalk.yellow(trans.status.summaryIntranet));
        } else {
          console.log(chalk.green(trans.status.summaryOk));
        }

        await new Promise<void>((resolve) => {
          const stopWait = () => {
            clearTimeout(timer);
            stopController.signal.removeEventListener('abort', stopWait);
            resolve();
          };
          const timer = setTimeout(stopWait, intervalSeconds * 1000);
          stopController.signal.addEventListener('abort', stopWait, { once: true });
          if (stopController.signal.aborted) stopWait();
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
  const hasIntranetFailures = services.some((service) => service.intranet && !service.ok);

  if (flags.has('--json')) {
    process.stdout.write(JSON.stringify(serializeServiceStatus(services), null, 2) + '\n');
  } else {
    const useColor = !flags.has('--plain') && isTty(process.stdout.isTTY);
    console.log(renderServiceStatusTable(services, { color: useColor }));
    if (hasFailures) {
      console.error(chalk.yellow(t().status.summaryFail));
    } else if (hasIntranetFailures) {
      console.log(chalk.yellow(t().status.summaryIntranet));
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

  if (
    flags.has('--version') ||
    command === '--version' ||
    command === '-v' ||
    command === 'version'
  ) {
    if (command === '-v' || command === 'version') rejectUnexpectedArguments(command, args);
    console.log(APP_INFO.version);
    return;
  }

  if (flags.has('--help') || command === '--help' || command === '-h' || command === 'help') {
    if (command === '-h' || command === 'help') rejectUnexpectedArguments(command, args);
    printHelp();
    return;
  }

  validateFlags(command, flags);

  if (!command) {
    if (!hasInteractiveTerminal()) {
      const cliTrans = t().cli;
      console.error(chalk.red(cliTrans.requiresTty));
      console.error(chalk.dim(cliTrans.requiresTtyHint));
      process.exit(1);
    }
    await main({ skipLogo: flags.has('--no-logo') });
    return;
  }

  if (command === 'lang' || command === 'language') {
    rejectUnexpectedArguments(command, args.slice(1));
    const language = (args[0] ?? '').toLowerCase();
    if (language !== 'zh' && language !== 'en') {
      console.error(chalk.red(t().cli.invalidLang));
      process.exit(1);
    }
    const persisted = saveLanguagePreference(language);
    if (persisted) {
      console.log(chalk.green(`${pickIcon('✓', 'OK')}: ${t().language.changed}`));
    } else {
      console.log(chalk.yellow(`${pickIcon('⚠', 'WARN')}: ${t().language.changedSessionOnly}`));
    }
    return;
  }

  if (command === 'theme') {
    const themeScope = args[0];
    if (args.length > 2 || (themeScope === 'reset' && args.length > 1)) {
      rejectUnexpectedArguments(command, args.slice(themeScope === 'reset' ? 1 : 2));
    }
    const result = runThemeCommand(args, { forcePlain: flags.has('--plain') });
    if (!result.ok) {
      console.error(chalk.red(result.message));
      process.exit(1);
    }
    if (result.message) {
      console.log(chalk.green(`${pickIcon('✓', 'OK')}: ${result.message}`));
    }
    return;
  }

  if (command === 'update') {
    rejectUnexpectedArguments(command, args);
    if (!(await runUpdateCheck())) process.exitCode = 1;
    return;
  }

  if (command === 'schedule' || command === 'timetable') {
    if (args.length > 1) {
      console.error(chalk.red(t().timetable.invalidArguments));
      process.exitCode = 1;
      return;
    }
    const exitCode = await runStudentTimetableCommand(args[0], { flags });
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  const action = ACTION_ALIASES[command];
  if (!action) {
    const cliT = t().cli;
    console.error(chalk.red(fmt(cliT.unknownCommand, { command })));
    console.error(chalk.dim(cliT.unknownCommandHint));
    process.exit(1);
  }

  rejectUnexpectedArguments(command, args);

  if (action === 'events') {
    await runEventsCommand(flags);
    return;
  }

  if (action === 'status') {
    const ok = await runStatusCommand(flags);
    if (!ok) process.exitCode = 1;
    return;
  }

  if (action === 'docs') {
    if (flags.has('--open')) {
      const opened = await openDocsInBrowser();
      if (!opened) process.exitCode = 1;
    } else if (!hasInteractiveTerminal()) {
      process.stdout.write(URLS.docs + '\n');
    } else {
      const { showDocsMenu } = await import('./features/docs.js');
      await showDocsMenu();
    }
    return;
  }

  if (action === 'about') {
    showAbout();
    return;
  }

  const mappedUrl = URL_ACTIONS[action];
  if (mappedUrl) {
    if (flags.has('--open')) {
      if (!(await openUrlInBrowser(mappedUrl))) process.exitCode = 1;
    } else {
      process.stdout.write(mappedUrl + '\n');
    }
    return;
  }
}

await runCommandMode(process.argv.slice(2)).catch(handleGracefulExit);
