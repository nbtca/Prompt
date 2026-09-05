import {
  renderMenu,
  renderMenuOption,
  nextIndex,
  parseKey,
  type MenuOption,
} from '../../core/components/menu.js';
import { space, type } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t, fmt } from '../../i18n/index.js';
import { visualWidth, wrapAnsiToVisualWidth } from '../../core/text.js';

export interface ListFieldConfig {
  title?: string;
  options: MenuOption[];
  footer?: string;
  initialIndex?: number;
  maxVisible?: number;
}

export interface ListFieldResult {
  selected?: string;
  cancelled?: boolean;
}

export function computeMaxVisible(bodyRows: number): number {
  return Math.max(3, bodyRows - 4);
}

function renderIndentedOutput(value: string, cols: number): string[] {
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, width - visualWidth(indent));
  return wrapAnsiToVisualWidth(value, contentWidth).map((line) => `${indent}${line}`);
}

export class ListField {
  private index: number;
  private scrollTop = 0;
  private maxVisible: number | undefined;

  constructor(private readonly config: ListFieldConfig) {
    this.index = config.initialIndex ?? 0;
    this.maxVisible = config.maxVisible;
    this.clampScroll();
  }

  get selectedIndex(): number {
    return this.index;
  }

  get optionCount(): number {
    return this.config.options.length;
  }

  setMaxVisible(maxVisible: number | undefined): void {
    this.maxVisible = maxVisible;
    this.clampScroll();
  }

  render(maxRows = Number.POSITIVE_INFINITY, cols = Number.POSITIVE_INFINITY): string[] {
    const expanded = this.renderExpanded(cols);
    if (!Number.isFinite(maxRows) || expanded.length <= maxRows) return expanded;
    return this.renderCompact(Math.max(0, Math.floor(maxRows)), cols);
  }

  private renderExpanded(cols: number): string[] {
    const { title, options, footer } = this.config;
    const maxVisible = this.maxVisible;
    if (!maxVisible || options.length <= maxVisible) {
      return renderMenu(
        {
          ...(title === undefined ? {} : { title }),
          options,
          selectedIndex: this.index,
          ...(footer === undefined ? {} : { footer }),
        },
        cols,
      ).split('\n');
    }

    const visible = options.slice(this.scrollTop, this.scrollTop + maxVisible);
    const lines = renderMenu(
      {
        ...(title === undefined ? {} : { title }),
        options: visible,
        selectedIndex: this.index - this.scrollTop,
      },
      cols,
    ).split('\n');

    const above = this.scrollTop;
    const below = options.length - (this.scrollTop + visible.length);
    if (above > 0 || below > 0) {
      const trans = t();
      const parts = [
        above > 0 ? fmt(trans.common.moreAbove, { count: above }) : null,
        below > 0 ? fmt(trans.common.moreBelow, { count: below }) : null,
      ].filter((part): part is string => part !== null);
      lines.push(...renderIndentedOutput(type.hint(parts.join(`  ${pickIcon('·', '-')}  `)), cols));
    }
    if (footer) lines.push('', ...renderIndentedOutput(type.hint(footer), cols));
    return lines;
  }

  private renderCompact(maxRows: number, cols: number): string[] {
    if (maxRows === 0) return [];
    const { title, options } = this.config;
    if (options.length === 0) {
      return title ? renderIndentedOutput(type.heading(title), cols).slice(0, maxRows) : [];
    }

    const labelWidth = options.reduce(
      (width, option) => Math.max(width, visualWidth(option.label)),
      0,
    );
    const optionGroups = options.map((option, index) =>
      renderMenuOption(option, index === this.index, labelWidth, cols),
    );
    const selectedLines = optionGroups[this.index] ?? [];
    const titleValue = !title
      ? ''
      : options.length > 1
        ? `${type.heading(title)}${type.hint(`  ${this.index + 1}/${options.length}`)}`
        : type.heading(title);
    const titleLines = title ? renderIndentedOutput(titleValue, cols) : [];
    let header: string[] = [];
    if (titleLines.length === 0) header = [];
    else if (titleLines.length + 1 + selectedLines.length <= maxRows) header = [...titleLines, ''];
    else if (titleLines.length + selectedLines.length <= maxRows) header = titleLines;

    const optionBudget = maxRows - header.length;
    if (selectedLines.length > optionBudget) {
      return [...header, ...selectedLines.slice(0, optionBudget)];
    }

    let start = this.index;
    let end = this.index + 1;
    let usedRows = selectedLines.length;
    const optionLimit = this.maxVisible ?? Number.POSITIVE_INFINITY;
    while (end - start < optionLimit) {
      const after = optionGroups[end];
      if (after && usedRows + after.length <= optionBudget) {
        usedRows += after.length;
        end += 1;
        continue;
      }
      const before = optionGroups[start - 1];
      if (before && usedRows + before.length <= optionBudget) {
        usedRows += before.length;
        start -= 1;
        continue;
      }
      break;
    }
    return [...header, ...optionGroups.slice(start, end).flat()];
  }

  handleKey(key: string): ListFieldResult {
    const parsed = parseKey(key);
    if (parsed === 'cancel') return { cancelled: true };
    if (parsed === 'enter') {
      const selected = this.config.options[this.index]?.value;
      return selected === undefined ? {} : { selected };
    }
    const pageSize = Math.max(1, (this.maxVisible ?? 6) - 1);
    const next = nextIndex(this.index, parsed, this.config.options.length, pageSize);
    if (next !== this.index) {
      this.index = next;
      this.clampScroll();
    }
    return {};
  }

  private clampScroll(): void {
    const maxVisible = this.maxVisible;
    if (!maxVisible) {
      this.scrollTop = 0;
      return;
    }
    if (this.index < this.scrollTop) this.scrollTop = this.index;
    else if (this.index >= this.scrollTop + maxVisible)
      this.scrollTop = this.index - maxVisible + 1;
    this.scrollTop = Math.max(
      0,
      Math.min(this.scrollTop, Math.max(0, this.config.options.length - maxVisible)),
    );
  }
}

export function renderListFieldWithContext(
  context: readonly string[],
  field: ListField,
  maxRows: number,
  cols = Number.POSITIVE_INFINITY,
): string[] {
  if (!Number.isFinite(maxRows))
    return [...context, ...field.render(Number.POSITIVE_INFINITY, cols)];
  const rows = Math.max(0, Math.floor(maxRows));
  if (rows === 0) return [];

  const expanded = field.render(Number.POSITIVE_INFINITY, cols);
  if (context.length + expanded.length <= rows) return [...context, ...expanded];
  if (expanded.length === 0) return context.slice(0, rows);

  const minimumFieldRows = Math.min(3, rows, expanded.length);
  const contextRows = Math.min(context.length, rows - minimumFieldRows);
  const fieldRows = rows - contextRows;
  return [...context.slice(0, contextRows), ...field.render(fieldRows, cols)];
}
