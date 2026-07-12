import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import type { ViewId } from './keys.js';

export function renderHeader(views: { id: ViewId; title: string }[], active: ViewId, cols: number): string[] {
  const brand = `${space.indent}${type.heading('nbtca')}`;
  const sep = `  ${pickIcon('·', '-')}  `;
  const tabs = space.indent + views
    .map((v) => (v.id === active ? type.heading(`[${v.title}]`) : type.hint(v.title)))
    .join(sep);
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  return [brand, tabs, rule];
}

export function renderFooter(_active: ViewId, cols: number): string[] {
  const trans = t();
  const dot = pickIcon('·', '-');
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  const hint = space.indent + type.hint(
    `1-7 / Tab ${dot} ${trans.menu.hintMove} ${dot} ${trans.menu.hintOpen} ${dot} Esc ${dot} q ${trans.menu.hintQuit}`,
  );
  return [rule, hint];
}
