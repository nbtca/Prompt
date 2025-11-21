/**
 * Vim 键位支持
 * 通过拦截和转换键盘输入来实现 j/k/g/G/q 键位
 */

/**
 * 为 stdin 添加 Vim 键位映射
 */
export function enableVimKeys() {
  const stdin = process.stdin;

  // 确保 stdin 是 TTY
  if (!stdin.isTTY) {
    return;
  }

  // 保存原始的输入处理
  const originalEmit = stdin.emit.bind(stdin);

  // 重写 emit 方法来拦截键盘事件
  (stdin.emit as any) = function (event: string, ...args: any[]) {
    if (event === 'keypress') {
      const [, key] = args;

      if (key && key.name) {
        // j = 向下 (映射为 down)
        if (key.name === 'j' && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'down' });
        }

        // k = 向上 (映射为 up)
        if (key.name === 'k' && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'up' });
        }

        // g = 跳到顶部 (映射为 home)
        if (key.name === 'g' && !key.shift && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'home' });
        }

        // G (Shift+g) = 跳到底部 (映射为 end)
        if (key.name === 'g' && key.shift) {
          return originalEmit('keypress', null, { name: 'end' });
        }

        // q = 退出 (映射为 Ctrl+C)
        if (key.name === 'q' && !key.ctrl && !key.meta) {
          return originalEmit('keypress', null, { name: 'c', ctrl: true });
        }
      }
    }

    return originalEmit(event, ...args);
  };
}

/**
 * 禁用 Vim 键位映射
 */
export function disableVimKeys() {
  // 这个功能暂时不需要实现，因为我们会在整个应用中使用 Vim 键位
}
