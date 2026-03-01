# Terminal UX

## Principles

- Keep interactive mode fast and readable.
- Keep command mode predictable and composable.
- Print machine output to `stdout`; print failures to `stderr`.
- Never force browser side effects in command mode unless requested.

## Modes

Interactive mode (`nbtca`):
- Full TUI menu with key hints.
- Vim-style navigation (`j/k/g/G/q`) plus arrow keys.
- Best for human-driven exploration.

Command mode (`nbtca <command>`):
- Single-purpose execution.
- Suitable for pipes and scripts.
- Supports `--plain`, `--json` (events), and `--open` for URL commands.

## Command Output Contract

- `nbtca events --json`: prints JSON array only.
- `nbtca events --plain`: prints plain text table.
- `nbtca repair|website|github|roadmap`: prints URL only.
- `nbtca <url-command> --open`: opens browser explicitly.

## Visual Conventions

- ASCII-safe menu symbols: `[..]`, `[DIR]`, `[MD]`, `[x]`.
- Color and gradient effects are used only in TTY-friendly paths.
- Non-TTY path avoids animated visual output.

## Notes for Contributors

- Prefer simple argument handling and explicit side effects.
- Keep prompts shallow; avoid forcing users back to main menu after every action.
- Add features behind clear subcommands before adding new menu depth.
