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

## Usage

```bash
nbtca
```

Interactive mode:
- Arrow keys and Vim keys (`j/k/g/G/q`) are supported.
- Best for exploration and one-off usage.

Command mode (script-friendly):

```bash
nbtca events
nbtca events --json
nbtca events --plain
nbtca website
nbtca website --open
nbtca roadmap
nbtca lang en
nbtca --help
```

Behavior:
- URL commands (`repair`, `website`, `github`, `roadmap`) print URL by default.
- Add `--open` to open browser explicitly.
- `events --json` prints machine-readable JSON to stdout.

## Documentation

See the [Wiki](https://github.com/nbtca/Prompt/wiki) for:

- [Development Guide](https://github.com/nbtca/Prompt/wiki/Development)
- [Features](https://github.com/nbtca/Prompt/wiki/Features)
- [Terminal Compatibility](https://github.com/nbtca/Prompt/wiki/Terminal-Compatibility)
- [FAQ](https://github.com/nbtca/Prompt/wiki/FAQ)
- [Changelog](https://github.com/nbtca/Prompt/wiki/Changelog)

## Requirements

- Node.js >= 20.12.0

## License

MIT

## Links

- Website: https://nbtca.space
- GitHub: https://github.com/nbtca
- NPM: https://www.npmjs.com/package/@nbtca/prompt
