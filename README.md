# NBTCA Prompt

Terminal client for NBTCA events, documentation, status and personal timetables.

[![npm version](https://img.shields.io/npm/v/@nbtca/prompt)](https://www.npmjs.com/package/@nbtca/prompt)
[![License](https://img.shields.io/npm/l/@nbtca/prompt)](LICENSE)

## Requirements

- Node.js 20.12 or newer

## Install

```bash
npm install --global @nbtca/prompt
nbtca
```

Run a command without installing:

```bash
npx @nbtca/prompt --help
```

## Commands

```text
nbtca events [--json]
nbtca docs
nbtca status
nbtca schedule login
nbtca schedule terms
nbtca schedule export --term=2026:3 --week-one=YYYY-MM-DD
nbtca schedule logout
```

Use `--plain` for stable output without color. `schedule export --one-shot`
avoids reading or saving a campus session.

Prompt never stores passwords. Persisted sessions contain only a masked account
hint and a CookieJar, protected with user-only permissions on POSIX systems.
Treat exported calendars and session files as private data. See [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run check
```

`check` runs formatting, lint, full TypeScript validation, tests, build, package
consumer checks and dependency audit.

Project guides and release notes live in the [Wiki](https://github.com/nbtca/Prompt/wiki).

## License

MIT
