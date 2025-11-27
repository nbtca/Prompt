/**
 * Vim keybindings support
 * Intercepts and translates keyboard input for j/k/g/G/q/ESC keys
 */

/**
 * Enable Vim key mappings for stdin
 * Maps: j/k (down/up), g/G (home/end), q (quit), ESC (back)
 */
export function enableVimKeys() {
  const stdin = process.stdin;

  // Only enable for TTY sessions
  if (!stdin.isTTY) {
    return;
  }

  // Save original input handler
  const originalEmit = stdin.emit.bind(stdin);

  // Override emit method to intercept keyboard events
  (stdin.emit as any) = function (event: string, ...args: any[]) {
    if (event === 'keypress') {
      const [, key] = args;

      if (key && key.name) {
        // j = down (mapped to down arrow)
        if (key.name === 'j' && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'down' });
        }

        // k = up (mapped to up arrow)
        if (key.name === 'k' && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'up' });
        }

        // g = jump to top (mapped to home)
        if (key.name === 'g' && !key.shift && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'home' });
        }

        // G (Shift+g) = jump to bottom (mapped to end)
        if (key.name === 'g' && key.shift) {
          return originalEmit('keypress', null, { name: 'end' });
        }

        // ESC = back/cancel (pass through for menu handling)
        // Note: Applications should implement back navigation for ESC
        if (key.name === 'escape') {
          return originalEmit('keypress', null, { name: 'escape', sequence: '\x1b' });
        }

        // q = quit (mapped to Ctrl+C for application exit)
        if (key.name === 'q' && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'c', ctrl: true });
        }
      }
    }

    return originalEmit(event, ...args);
  };
}

/**
 * Disable Vim key mappings
 * Currently not implemented as we use Vim keys throughout the application
 */
export function disableVimKeys() {
  // Not needed for current implementation
}
