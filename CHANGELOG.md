# CHANGELOG

## [1.0.2] - 2025-11-27

### Added
- **Terminal Documentation Viewer**: Browse and read Markdown documentation from nbtca/documents repository directly in terminal
  - GitHub API integration for fetching directory structure and file contents
  - Recursive directory navigation with [DIR] and [MD] indicators
  - VitePress syntax cleaning (frontmatter, containers, [[toc]], HTML comments)
  - Terminal Markdown rendering using marked-terminal
  - Browser fallback on network errors or user preference
  - Retry mechanism for failed network requests

### Changed
- **ASCII-Only Interface**: Removed all emoji icons for maximum terminal compatibility
  - Replaced emoji with ASCII symbols: [*], [?], [x], [..], [DIR], [MD], [ <], [ ^], [ *]
  - Works on all terminal emulators, SSH sessions, tmux, and legacy systems
  - Follows Unix/Linux terminal conventions
  - Professional, minimalist design

### Improved
- **Terminal UX Enhancements**:
  - Added keybinding hints to main menu: "Navigation: j/k or ↑/↓ | Jump: g/G | Quit: q or Ctrl+C"
  - Added ESC key infrastructure for future back navigation and operation cancellation
  - Standardized navigation symbols across all menus
  - Better vim-keys.ts documentation with clearer comments

### Fixed
- **Development Workflow**: Fixed `pnpm run dev` auto-restart issue
  - Split dev command: `dev` (no watch, for interactive CLI) and `dev:watch` (with watch mode)
  - Proper exit behavior for interactive CLI testing

### Documentation
- Added DEVELOPMENT.md: Comprehensive development guide with workflows, testing methods, and common issues
- Added TERMINAL_UX.md: Terminal UX improvements and compatibility documentation
- Updated README.md: Professional, concise documentation without decorative elements

### Technical Details
- Enhanced docs.ts with GitHub repository integration
- Improved menu.ts with ASCII symbols and keybinding hints
- Enhanced vim-keys.ts with ESC support and better documentation
- Better package.json scripts for development workflow

## [1.0.1] - 2025-11-21

### Added
- New English tagline with smooth blue gradient animation
- Full Vim keybindings support (j/k/g/G/q)
- Minimalist UI design inspired by Claude Code CLI

### Improved
- Smoother gradient animation (24 frames, 1.2s duration)
- Removed keyboard instruction text for cleaner interface
- Blue color scheme throughout (deep blue → sky blue → cyan)

### Changed
- q key now exits the application
- Removed Chinese tagline
- Simplified menu layout

### Removed
- Unused DATA_MANAGEMENT.md documentation

### Dependencies
- Updated gradient-string to ^3.0.0
- Updated @inquirer/prompts to ^8.0.3

## [1.0.0] - 2025-11-21

### Added
- Initial release of NBTCA Prompt CLI tool
- Interactive terminal menu system
- Event calendar integration
- Repair service information
- Knowledge base access
- Quick links to official website and GitHub
- About section with project information
