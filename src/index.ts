#!/usr/bin/env node

const argv = process.argv.slice(2);

if (argv.includes('--plain')) {
  delete process.env['FORCE_COLOR'];
  process.env['NO_COLOR'] = '1';
}

if (argv[0] === 'prompt' && !argv.includes('--help')) {
  const { runPromptCommand } = await import('./prompt.js');
  process.exitCode = runPromptCommand(argv.slice(1));
} else {
  await import('./cli.js');
}
