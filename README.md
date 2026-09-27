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

## Interactive mode

Run `nbtca` with no arguments to open the full-screen client. Press `1`–`5` or
`Tab` to switch tabs, and `?` to list every key.

- **Home**: today's classes and the next club events.
- **Schedule**: the current term, week, and next break from the school
  calendar. Log in to the campus system to see your timetable and export it as
  an `.ics` file.
- **Events**: the next event with a countdown, plus week, month, search,
  history, and a one-year activity heatmap.
- **Docs**: the NBTCA knowledge base, readable and searchable in the terminal.
  It is cached locally and served from a mirror when GitHub is unreachable.
- **Settings**: language, icon and color modes, and version info.

Events, docs, and the school calendar stay readable offline from the last
successful fetch.

## Commands

```text
nbtca events [--today|--week|--month] [--search=<q>] [--next=<n>] [--json]
nbtca events --heatmap
nbtca docs
nbtca status [--watch] [--json]
nbtca schedule login
nbtca schedule status
nbtca schedule terms
nbtca schedule export --term=2026:3 --week-one=YYYY-MM-DD [--output=<path>]
nbtca schedule logout
nbtca website|github|roadmap|repair [--open]
nbtca theme icon auto|ascii|unicode
nbtca theme color auto|on|off
nbtca theme reset
nbtca lang zh|en
nbtca update
```

`nbtca --help` lists every flag. Use `--plain` for stable output without color
and `--no-logo` to skip the startup logo. `schedule export --one-shot` avoids
reading or saving a campus session.

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

## License

MIT
