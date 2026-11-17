import { resolveIconMode } from './config/preferences.js';
import { promptClass, promptLine, serializePromptClass } from './features/prompt-line.js';
import { peekSchedule } from './features/schedule-view.js';
import { fmt, t } from './i18n/index.js';

const SHELL_SETUP: Record<string, string> = {
  fish: 'function fish_right_prompt; nbtca prompt; end',
  zsh: "setopt prompt_subst\nRPROMPT='$(nbtca prompt)'",
  bash: 'PS1=\'$(c=$(nbtca prompt); [ -n "$c" ] && printf "%s " "$c")\'"$PS1"',
  tmux: "set -g status-interval 30\nset -g status-right '#(nbtca prompt)  %H:%M'",
};

function unicodeWanted(plain: boolean): boolean {
  if (plain) return false;
  const mode = resolveIconMode();
  if (mode !== 'auto') return mode === 'unicode';
  const locale = `${process.env['LC_ALL'] ?? ''} ${process.env['LANG'] ?? ''}`.toLowerCase();
  return /utf-?8/.test(locale);
}

function fail(message: string): number {
  process.stderr.write(message + '\n');
  return 1;
}

/** Runs on every shell prompt, so it reads only the local cache and never loads the full CLI. */
export function runPromptCommand(argv: readonly string[]): number {
  const cli = t().cli;
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const extra = argv.find((arg) => !arg.startsWith('--'));
  if (extra !== undefined) return fail(fmt(cli.unexpectedArguments, { command: 'prompt' }));
  const unknown = flags.find(
    (flag) => flag !== '--json' && flag !== '--plain' && !flag.startsWith('--shell='),
  );
  if (unknown !== undefined) return fail(fmt(cli.invalidFlag, { flag: unknown }));

  const shellFlag = flags.find((flag) => flag.startsWith('--shell='));
  if (shellFlag !== undefined) {
    const setup = SHELL_SETUP[shellFlag.slice('--shell='.length)];
    if (setup === undefined) return fail(fmt(cli.invalidFlag, { flag: shellFlag }));
    process.stdout.write(setup + '\n');
    return 0;
  }

  const schedule = peekSchedule();
  const value = schedule ? promptClass(schedule) : undefined;
  if (flags.includes('--json')) {
    process.stdout.write(JSON.stringify(serializePromptClass(value)) + '\n');
    return 0;
  }
  const line = promptLine(value, unicodeWanted(flags.includes('--plain')));
  if (line) process.stdout.write(line + '\n');
  return 0;
}
