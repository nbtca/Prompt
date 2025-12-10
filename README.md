# NBTCA Prompt

Terminal-based information system for NingboTech Computer Association.

[![npm version](https://img.shields.io/npm/v/@nbtca/prompt)](https://www.npmjs.com/package/@nbtca/prompt)
[![License](https://img.shields.io/npm/l/@nbtca/prompt)](LICENSE)

## Overview

NBTCA Prompt is a minimalist command-line interface tool designed for the Computer Association of Zhejiang University Ningbo Institute of Technology. It provides quick access to association resources, events, and documentation directly from the terminal.

## Features

- View upcoming association events (30-day calendar)
- Access repair service information
- Browse technical documentation from terminal with pager support (vim/journalctl style)
- Quick links to official website and GitHub
- Minimalist design with maximum terminal compatibility
- Smooth gradient animations for enhanced visual experience

## Installation

### Global Installation

```bash
npm install -g @nbtca/prompt
```

### Using npx (No Installation Required)

```bash
npx @nbtca/prompt
```

## Usage

Run the program with:

```bash
nbtca
```

Navigate using arrow keys or Vim bindings (j/k/g/G).

## Development

### Prerequisites

- Node.js >= 16.0.0

### Setup

```bash
git clone https://github.com/nbtca/prompt.git
cd prompt
pnpm install
```

### Development Workflow

#### Quick Testing (Recommended)

```bash
pnpm run dev
```

Runs TypeScript source directly without auto-restart. Exit with menu option or Ctrl+C.

#### Watch Mode (File Changes)

```bash
pnpm run dev:watch
```

Auto-restarts on file changes. Not recommended for interactive testing.

#### Production Build

```bash
pnpm run build
pnpm start
```

### Available Commands

```bash
pnpm run dev         # Run TypeScript source directly
pnpm run dev:watch   # Run with file watching
pnpm run build       # Compile TypeScript to JavaScript
pnpm start           # Run compiled code
pnpm run clean       # Remove dist directory
```

## Project Structure

```
src/
├── config/          # Configuration constants
│   ├── data.ts     # URLs and app info
│   └── theme.ts    # Color themes
├── core/           # Core functionality
│   ├── logo.ts     # Logo display logic
│   ├── menu.ts     # Main menu system
│   ├── ui.ts       # UI components
│   └── vim-keys.ts # Vim key bindings
├── features/       # Feature modules
│   ├── calendar.ts # Event calendar
│   ├── docs.ts     # Documentation viewer
│   ├── repair.ts   # Repair service
│   └── website.ts  # Website links
└── main.ts         # Application entry point
```

## Technology Stack

### Core Dependencies

- axios - HTTP requests
- ical.js - ICS calendar parsing
- marked + marked-terminal - Markdown rendering
- chalk - Terminal colors
- inquirer - Interactive prompts
- open - Browser integration

### Development Dependencies

- TypeScript 5.3+
- tsx - TypeScript execution
- @types/* - Type definitions

## Documentation Viewer

The knowledge base viewer features:

- Direct GitHub repository access with authentication support
- Pager-style document reading (similar to vim/journalctl/less)
- VitePress syntax cleaning
- Terminal Markdown rendering with color support
- Browser fallback option
- Directory tree navigation
- Improved error handling with rate limit detection

### GitHub Token Configuration (Optional)

To avoid GitHub API rate limits when browsing documentation, you can set a GitHub token:

```bash
export GITHUB_TOKEN="your_github_token_here"
# or
export GH_TOKEN="your_github_token_here"
```

Without a token, you have 60 requests per hour. With a token, you get 5000 requests per hour.

### Supported Formats

- Standard Markdown
- VitePress frontmatter (auto-removed)
- VitePress containers (auto-converted)
- Table of contents (placeholder in terminal)

## Terminal Compatibility

Designed for maximum compatibility with:

- Modern terminals (iTerm2, Windows Terminal, GNOME Terminal)
- Legacy terminals (xterm, Terminal.app)
- SSH sessions
- Screen/tmux multiplexers

ASCII-based UI elements ensure rendering on any terminal emulator.

## System Requirements

- Node.js: >= 16.0.0
- OS: Windows, macOS, Linux
- Terminal: ANSI escape sequence support

## Common Issues

### Q: Getting 403 error when browsing documentation?

A: This is due to GitHub API rate limiting. Set a `GITHUB_TOKEN` environment variable to increase your rate limit from 60 to 5000 requests per hour. See the [GitHub Token Configuration](#github-token-configuration-optional) section above.

### Q: Auto-restart when using `pnpm run dev:watch`?

A: This is expected behavior. Use `pnpm run dev` for interactive testing.

### Q: How to exit the program?

A: Select the Exit option from menu, or press Ctrl+C.

### Q: How to navigate documents in the pager?

A: Use arrow keys, Space (page down), 'j/k' (vim-style), or 'q' to quit the pager.

### Q: Changes not reflected?

A: If using `pnpm start`, rebuild with `pnpm run build` first.

## Contributing

Contributions are welcome. Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Follow existing code style
4. Add appropriate comments
5. Ensure build passes
6. Submit pull request

### Code Standards

- Use TypeScript strict mode
- Add JSDoc comments for functions
- Use .js extension in imports (even for .ts files)
- Keep code simple and readable

## License

MIT License - See LICENSE file for details

## Contact

- Website: https://nbtca.space
- Email: contact@nbtca.space
- GitHub: https://github.com/nbtca
- NPM: https://www.npmjs.com/package/@nbtca/prompt

## Changelog

### v1.0.5 (2025-12-10)

- **Fixed**: Knowledge Base 403 error due to GitHub API rate limiting
- **Added**: GitHub token authentication support (GITHUB_TOKEN/GH_TOKEN)
- **Added**: Pager-style document viewer (vim/journalctl/less style)
- **Added**: "Re-read document" option after viewing
- **Improved**: Better error messages with rate limit information
- **Improved**: Document reading experience with scroll navigation

### v1.0.4 (2025-12-10)

- **Enhanced**: Smooth slogan animation with true color interpolation
- **Improved**: 60 FPS animation with sine easing for natural transitions
- **Technical**: Added hexToRgb, rgbToHex, and interpolateColor functions

### v1.0.3 (2025-11-27)

- Version alignment and bug fixes

### v1.0.1 (2025-11-27)

- Added terminal documentation viewer
- Removed emoji icons for better compatibility
- Improved Markdown rendering
- Added VitePress syntax cleaning
- Enhanced directory navigation

### v1.0.0 (2025-11-21)

- Complete TypeScript rewrite
- Minimalist UI redesign
- ICS calendar integration
- Terminal Markdown renderer
- Smart logo display with fallback

## Acknowledgments

Built with focus on simplicity and terminal compatibility.

---

Made by [NBTCA](https://nbtca.space)
