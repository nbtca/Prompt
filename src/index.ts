#!/usr/bin/env node

if (process.argv.slice(2).includes('--plain')) {
  delete process.env['FORCE_COLOR'];
  process.env['NO_COLOR'] = '1';
}

await import('./cli.js');
