import { type, space, glyph, brandMark, MAX_FRAME_COLS } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import type { ViewId } from './keys.js';
import { clipAnsiToVisualWidth, visualWidth } from '../core/text.js';

export const HEADER_LINES = 3;
export const FOOTER_LINES = 2;

export interface ChromeLayout {
  headerLines: 0 | 1 | 2 | 3;
  footerLines: 0 | 1 | 2;
}

export function resolveChromeLayout(rows: number): ChromeLayout {
  const height = Math.max(0, Math.floor(rows));
  if (height >= 11) return { headerLines: 3, footerLines: 2 };
  if (height >= 9) return { headerLines: 3, footerLines: 1 };
  if (height >= 7) return { headerLines: 2, footerLines: 1 };
  if (height >= 4) return { headerLines: 1, footerLines: 1 };
  if (height >= 2) return { headerLines: 1, footerLines: 0 };
  return { headerLines: 0, footerLines: 0 };
}

function renderRule(cols: number): string {
  const terminal = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : 80;
  const width = Math.min(terminal, MAX_FRAME_COLS);
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const ruleWidth = Math.max(1, width - visualWidth(indent) * 2);
  return indent + type.hint(glyph.rule().repeat(ruleWidth));
}

function renderTabs(views: { id: ViewId; title: string }[], active: ViewId, cols: number): string {
  const dot = pickIcon('·', '-');
  const full =
    space.indent +
    views
      .map((view) => (view.id === active ? type.active(`[${view.title}]`) : type.hint(view.title)))
      .join(`  ${dot}  `);
  if (visualWidth(full) <= cols) return full;

  const compact =
    space.indent +
    views
      .map((view, index) =>
        view.id === active
          ? type.active(`[${index + 1} ${view.title}]`)
          : type.hint(String(index + 1)),
      )
      .join(` ${dot} `);
  if (visualWidth(compact) <= cols) return compact;

  const numeric =
    space.indent +
    views
      .map((view, index) =>
        view.id === active ? type.active(`[${index + 1}]`) : type.hint(String(index + 1)),
      )
      .join(' ');
  if (visualWidth(numeric) <= cols) return numeric;

  const activeIndex = views.findIndex((view) => view.id === active);
  const activeView = views[activeIndex];
  if (!activeView) return '';
  const activeWithTitle = `${space.indent}${type.active(`[${activeIndex + 1} ${activeView.title}]`)}`;
  if (visualWidth(activeWithTitle) <= cols) return activeWithTitle;
  const activeNumber = `${space.indent}${type.active(`[${activeIndex + 1}]`)}`;
  if (visualWidth(activeNumber) <= cols) return activeNumber;
  return type.active(String(activeIndex + 1));
}

export function renderContextPath(segments: readonly string[], cols: number): string {
  const chevron = pickIcon('›', '>');
  const ellipsis = pickIcon('…', '...');
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  for (let start = 0; start < segments.length; start += 1) {
    const shown = segments.slice(start);
    const last = shown.length - 1;
    const plain = [...(start > 0 ? [ellipsis] : []), ...shown].join(` ${chevron} `);
    if (visualWidth(space.indent + plain) > width) continue;
    const styled = shown
      .map((segment, index) => (index === last ? type.label(segment) : type.hint(segment)))
      .join(type.hint(` ${chevron} `));
    return space.indent + (start > 0 ? type.hint(`${ellipsis} ${chevron} `) : '') + styled;
  }
  const leaf = segments[segments.length - 1] ?? '';
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const room = Math.max(1, width - visualWidth(indent));
  return indent + type.label(clipAnsiToVisualWidth(leaf, room));
}

export function renderHeader(
  views: { id: ViewId; title: string }[],
  active: ViewId,
  cols: number,
  lineCount: ChromeLayout['headerLines'] = HEADER_LINES,
  contextPath?: readonly string[],
): string[] {
  if (lineCount === 0) return [];
  const mark = brandMark('nbtca');
  const brand =
    contextPath && contextPath.length > 0
      ? renderContextPath(contextPath, cols)
      : `${visualWidth(space.indent + mark) <= cols ? space.indent : ''}${mark}`;
  const tabs = renderTabs(views, active, cols);
  const rule = renderRule(cols);
  if (lineCount === 1) return [tabs];
  if (lineCount === 2) return [brand, tabs];
  return [brand, tabs, rule];
}

export function fitFooterHint(cols: number, ...candidates: string[]): string {
  return (
    candidates.find((candidate) => visualWidth(space.indent + candidate) <= cols) ??
    candidates[candidates.length - 1] ??
    ''
  );
}

export function captureFooterHint(cols = Number.POSITIVE_INFINITY): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  return fitFooterHint(
    cols,
    `Ctrl+C ${trans.common.exit}  ${dot}  Esc ${trans.common.back}  ${dot}  Enter ${trans.common.confirm}`,
    'Ctrl+C Esc Enter',
    'Ctrl+C Esc',
    'Ctrl+C',
  );
}

export function digitTabHint(tabCount: number): string {
  const dot = pickIcon('·', '-');
  return tabCount > 1 ? `1-${tabCount} / Tab ${dot} ` : '';
}

export function passiveFooterHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  const compactTabs = tabCount > 1 ? `1-${tabCount}/Tab ${dot} ` : '';
  return fitFooterHint(
    cols,
    `${digitTabHint(tabCount)}Esc ${dot} q ${trans.menu.hintQuit}`,
    `${compactTabs}Esc ${dot} q`,
    `Esc ${dot} q`,
    'q',
  );
}

function interactiveFooterHint(tabCount: number, cols: number): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  const fullTabs = digitTabHint(tabCount);
  const compactTabs = tabCount > 1 ? `1-${tabCount}/Tab ${dot} ` : '';
  const localFull = `${trans.menu.hintMove} ${dot} ${trans.menu.hintOpen} ${dot} Esc ${dot} q ${trans.menu.hintQuit}`;
  const localCompact = `${trans.menu.hintMove} ${trans.menu.hintOpen} Esc q`;
  const candidates = [
    `${fullTabs}${localFull}`,
    `${compactTabs}${localFull}`,
    localFull,
    `${compactTabs}${localCompact}`,
    localCompact,
    `${trans.menu.hintOpen} Esc q`,
    `Esc ${dot} q`,
    'q',
  ];
  return fitFooterHint(cols, ...candidates);
}

export function renderFooter(
  _active: ViewId,
  cols: number,
  tabCount: number,
  overrideHint?: string,
  lineCount: ChromeLayout['footerLines'] = FOOTER_LINES,
  position?: string,
): string[] {
  if (lineCount === 0) return [];
  const rule = renderRule(cols);
  const hintText = overrideHint ?? interactiveFooterHint(tabCount, cols);
  const indent = visualWidth(space.indent + hintText) <= cols ? space.indent : '';
  const hint = indent + type.hint(hintText);
  return lineCount === 1
    ? [withPosition(hint, hintText, indent, position, cols)]
    : [rule, withPosition(hint, hintText, indent, position, cols)];
}

function withPosition(
  hint: string,
  hintText: string,
  indent: string,
  position: string | undefined,
  cols: number,
): string {
  if (position === undefined) return hint;
  const frame = Math.min(cols, MAX_FRAME_COLS);
  const margin = visualWidth(space.indent) < frame ? space.indent : '';
  const gap = frame - visualWidth(indent + hintText) - visualWidth(position) - visualWidth(margin);
  if (gap < 2) return hint;
  return hint + ' '.repeat(gap) + type.hint(position) + margin;
}
