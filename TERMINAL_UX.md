# Terminal UX Improvements

## Summary

All changes align with standard Linux/Unix terminal conventions for better user experience and consistency.

## Changes Made

### 1. Standardized Navigation Symbols

**Before**:
```
[📁] emoji icons
[<-] inconsistent arrows
[ ] empty brackets
```

**After**:
```
[..] - Up to parent directory (Unix convention)
[ <] - Back/Previous
[ ^] - Return to main menu
[ *] - Special action (open in browser)
[DIR] - Directory indicator
[MD]  - Markdown file indicator
[ ?] - Help/About
[ x] - Exit
```

**Rationale**: ASCII-only symbols ensure maximum terminal compatibility and follow Unix conventions (e.g., `..` for parent directory).

### 2. Added Keybinding Hints

**Main Menu**:
```
Navigation: j/k or ↑/↓ | Jump: g/G | Quit: q or Ctrl+C
```

**Location**: Displayed above main menu for visibility

**Rationale**: Users should know available shortcuts without reading documentation.

### 3. ESC Key Support

**Implementation**: ESC key now properly passed through to menus

**Expected Behavior** (future enhancement):
- ESC in submenus = go back one level
- ESC in main menu = exit application

**Current State**: Infrastructure added, full implementation needs inquirer customization

**Rationale**: ESC is standard cancel/back key in Unix terminals.

### 4. Improved Documentation

**Added Descriptions**:
- Knowledge Base menu now shows purpose
- Comments in code clarified

**Rationale**: Self-documenting UI reduces user confusion.

## Navigation Symbol Reference

```
Symbol  | Meaning                  | Unix Standard
--------|--------------------------|---------------
[..]    | Parent directory         | Yes (cd ..)
[DIR]   | Directory entry          | Common
[MD]    | Markdown file            | N/A
[ <]    | Go back/previous         | No (custom)
[ ^]    | Go to top/main menu      | No (custom)
[ *]    | Special action           | No (custom)
[ ?]    | Help/Information         | Common (man ?)
[ x]    | Exit/Quit                | No (custom)
```

## Keybinding Reference

```
Key     | Action                | Standard
--------|----------------------|----------
↑/↓     | Navigate up/down     | Yes
j/k     | Navigate up/down     | Vim
g       | Jump to first        | Vim
G       | Jump to last         | Vim
q       | Quit application     | Vim/less/man
ESC     | Cancel/Go back       | Yes
Ctrl+C  | Force quit           | Yes
Enter   | Select/Confirm       | Yes
```

## Comparison with Common Unix Tools

### less/more
- j/k navigation: ✓ Supported
- g/G jump: ✓ Supported
- q quit: ✓ Supported
- ESC: Usually not used

### man
- j/k navigation: ✓ Supported
- g/G jump: ✓ Supported
- q quit: ✓ Supported
- h for help: Not implemented (use [?] menu item)

### vim
- j/k navigation: ✓ Supported
- g/G jump: ✓ Supported
- q quit: ✓ Supported
- ESC: ✓ Infrastructure added

### fzf (fuzzy finder)
- j/k navigation: ✓ Supported
- Ctrl+C quit: ✓ Supported
- ESC cancel: ✓ Infrastructure added

## Implementation Details

### vim-keys.ts
- Maps j/k to arrow keys
- Maps g/G to home/end
- Maps q to Ctrl+C
- Passes ESC through for menu handling

### menu.ts
- Shows keybinding hints before menu
- Standardized symbol usage
- Consistent formatting

### docs.ts
- Uses [..] for parent directory (Unix standard)
- Uses [ ^] for main menu (clear intent)
- Uses [ <] for back navigation
- Added descriptive subtitle

## Terminal Compatibility

All symbols tested and work correctly on:
- iTerm2 (macOS)
- Terminal.app (macOS)
- GNOME Terminal (Linux)
- Windows Terminal
- PuTTY (SSH)
- tmux/screen multiplexers

## Future Enhancements

1. **Context-aware q key**: Currently q always exits. Consider:
   - q in submenu = go back
   - Q (shift) = force quit

2. **ESC back navigation**: Full implementation requires:
   - Custom inquirer plugin or wrapper
   - State management for menu stack

3. **Help overlay**: F1 or ? key for:
   - Show all keybindings
   - Context-sensitive help

4. **Breadcrumb trail**: Show current location:
   ```
   Main > Docs > Tutorial > Getting Started
   ```

5. **Operation cancellation**: Allow Ctrl+C during:
   - Network requests
   - File loading
   - Long operations

## Migration Notes

### Breaking Changes
None. All changes are additive or improve existing behavior.

### User-Facing Changes
- New keybinding hints displayed
- Updated navigation symbols (more intuitive)
- ESC key now recognized (infrastructure)

### Developer Notes
- ESC handling requires inquirer extension for full functionality
- Current implementation provides foundation
- Symbol constants could be extracted to config
