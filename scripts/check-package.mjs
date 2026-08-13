import { spawnSync } from 'node:child_process';
import { cp, copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'nbtca-prompt-package-'));

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_dry_run: 'false',
      npm_config_fund: 'false',
    },
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout ?? '';
}

function satisfiesCaret(version, range) {
  const installed = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);
  const required = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)?.slice(1).map(Number);
  if (!installed || !required) return false;
  const [major, minor, patch] = installed;
  const [requiredMajor, requiredMinor, requiredPatch] = required;
  const atLeastRequired =
    major > requiredMajor ||
    (major === requiredMajor &&
      (minor > requiredMinor || (minor === requiredMinor && patch >= requiredPatch)));
  if (!atLeastRequired) return false;
  if (requiredMajor > 0) return major === requiredMajor;
  if (requiredMinor > 0) return major === 0 && minor === requiredMinor;
  return major === 0 && minor === 0 && patch === requiredPatch;
}

try {
  run('npm', ['pack', '--pack-destination', temporaryDirectory], root);
  const tarballs = (await readdir(temporaryDirectory)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error('npm pack did not produce exactly one tarball');

  await writeFile(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const dependencyTarballs = ['NBTCA_DOCS_TARBALL', 'NBTCA_NBTCAL_TARBALL'].flatMap((name) => {
    const value = process.env[name];
    return value ? [resolve(root, value)] : [];
  });
  run(
    'npm',
    ['install', '--ignore-scripts', ...dependencyTarballs, join(temporaryDirectory, tarballs[0])],
    temporaryDirectory,
  );

  // Compile the real Prompt sources against the packages installed above. This
  // turns NBTCA_DOCS_TARBALL/NBTCA_NBTCAL_TARBALL into a full source contract
  // check instead of only proving that the CLI can print its version.
  await cp(join(root, 'src'), join(temporaryDirectory, 'src'), { recursive: true });
  await copyFile(join(root, 'tsconfig.json'), join(temporaryDirectory, 'tsconfig.json'));
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
      '--noEmit',
      '--typeRoots',
      join(root, 'node_modules/@types'),
    ],
    temporaryDirectory,
  );

  const installedPackage = join(temporaryDirectory, 'node_modules/@nbtca/prompt');
  const packageJson = JSON.parse(await readFile(join(installedPackage, 'package.json'), 'utf8'));
  const docsPackage = JSON.parse(
    await readFile(join(temporaryDirectory, 'node_modules/@nbtca/docs/package.json'), 'utf8'),
  );
  const nbtcalPackage = JSON.parse(
    await readFile(join(temporaryDirectory, 'node_modules/@nbtca/nbtcal/package.json'), 'utf8'),
  );
  const dependencyRanges = {
    '@nbtca/docs': packageJson.dependencies?.['@nbtca/docs'],
    '@nbtca/nbtcal': packageJson.dependencies?.['@nbtca/nbtcal'],
  };
  for (const [name, installed] of [
    ['@nbtca/docs', docsPackage.version],
    ['@nbtca/nbtcal', nbtcalPackage.version],
  ]) {
    const range = dependencyRanges[name];
    if (typeof range !== 'string' || !satisfiesCaret(installed, range)) {
      throw new Error(`${name}@${installed} does not satisfy the package contract ${range ?? ''}`);
    }
  }
  const entry = 'dist/index.js';
  if (packageJson.main !== entry || packageJson.exports?.['.'] !== `./${entry}`) {
    throw new Error('the package root no longer resolves to the CLI entrypoint');
  }
  for (const command of ['nbtca', 'nbtca-welcome']) {
    if (packageJson.bin?.[command] !== entry) {
      throw new Error(`${command} does not point directly to ${entry}`);
    }
  }
  const source = await readFile(join(installedPackage, entry), 'utf8');
  if (!source.startsWith('#!/usr/bin/env node\n')) {
    throw new Error(`${entry} does not start with a Node.js shebang`);
  }

  for (const command of ['nbtca', 'nbtca-welcome']) {
    const output = run(
      join(temporaryDirectory, 'node_modules/.bin', command),
      ['--version'],
      temporaryDirectory,
    ).trim();
    if (output !== packageJson.version) {
      throw new Error(
        `${command} reported ${output || '<empty>'}, expected ${packageJson.version}`,
      );
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
