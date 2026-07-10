# NBTCA Prompt

Terminal-based information system for NingboTech Computer Association.

[![npm version](https://img.shields.io/npm/v/@nbtca/prompt)](https://www.npmjs.com/package/@nbtca/prompt)
[![License](https://img.shields.io/npm/l/@nbtca/prompt)](LICENSE)

## Install

```bash
npm install -g @nbtca/prompt
```

Or run directly:

```bash
npx @nbtca/prompt
```

## Personal timetable

Prompt owns the school login and local session; `@nbtca/nbtcal` owns timetable
normalization and ICS generation.

For a persistent local session:

```bash
nbtca schedule login
nbtca schedule terms
nbtca schedule export --term=2026:3 --week-one=YYYY-MM-DD
nbtca schedule logout
```

For a single run that neither reads nor saves a session (`--no-save` is an
alias):

```bash
npx @nbtca/prompt schedule export --one-shot
```

Both the student id and password are masked in the terminal. The password is
never saved. A persistent login stores only a masked account hint and the
CookieJar in the user's state directory:

- Unix/macOS default: `~/.local/state/nbtca/session.json`
- Windows default: `%LOCALAPPDATA%/nbtca/session.json`
- `$XDG_STATE_HOME` is honored when it is an absolute path

On POSIX systems the directory is `0700` and the file is `0600`. `npx`, a local
installation and a global installation therefore share the same state without
depending on npm's disposable package cache. The session is a bearer secret;
use `--one-shot` on shared machines and `schedule logout` when finished.
Saved sessions use a sliding seven-day local expiry and are cleared immediately
when the school reports that they have expired.

JWXT currently returns week numbers and period times but not the first calendar
date of a term. When no authoritative date map is available, Prompt asks for
the first teaching Monday or accepts `--week-one=YYYY-MM-DD`. Confirm it against
the official school calendar; Prompt will not guess. A slider or other browser
challenge is also never bypassed—the CLI stops with an actionable message.
Without an authoritative date map, the result is a base teaching-week schedule:
holidays, make-up classes and temporary changes still require school notices.

## Documentation

Project documentation has been moved to the GitHub Wiki.

- [Home](https://github.com/nbtca/Prompt/wiki)
- [Getting Started](https://github.com/nbtca/Prompt/wiki/Getting-Started)
- [Development Guide](https://github.com/nbtca/Prompt/wiki/Development-Guide)
- [Terminal UX](https://github.com/nbtca/Prompt/wiki/Terminal-UX)
- [Release Notes](https://github.com/nbtca/Prompt/wiki/Release-Notes)
- [Features](https://github.com/nbtca/Prompt/wiki/Features)
- [Terminal Compatibility](https://github.com/nbtca/Prompt/wiki/Terminal-Compatibility)
- [FAQ](https://github.com/nbtca/Prompt/wiki/FAQ)

## Requirements

- Node.js >= 20.12.0

## License

MIT

## Links

- Website: https://nbtca.space
- GitHub: https://github.com/nbtca
- NPM: https://www.npmjs.com/package/@nbtca/prompt
