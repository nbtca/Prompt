import { space, type } from '../../core/theme.js';
import { visualWidth, wrapAnsiToVisualWidth } from '../../core/text.js';
import { ListField, renderListFieldWithContext } from '../fields/list-field.js';

export type SettingsMode = 'menu' | 'language' | 'icon' | 'color' | 'about';

export interface SettingsViewState {
  mode: SettingsMode;
  menuField?: ListField;
  subField?: ListField;
  aboutLines?: string[];
  backField?: ListField;
  statusMessage?: string;
}

function wrappedIndentedLines(
  label: string,
  cols: number,
  style: (value: string) => string,
): string[] {
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const styled = style(label);
  const preferredIndent = visualWidth(space.indent) < width ? space.indent : '';
  const indent = preferredIndent
    && visualWidth(styled) > width - visualWidth(preferredIndent)
    && visualWidth(styled) <= width
    ? ''
    : preferredIndent;
  const contentWidth = Math.max(1, width - visualWidth(indent));
  return wrapAnsiToVisualWidth(styled, contentWidth).map((line) => `${indent}${line}`);
}

export function renderSettings(
  state: SettingsViewState,
  bodyRows = Number.POSITIVE_INFINITY,
  cols = Number.POSITIVE_INFINITY,
): string[] {
  switch (state.mode) {
    case 'menu': {
      const context = [
        ...(state.statusMessage ? [...wrappedIndentedLines(state.statusMessage, cols, type.hint), ''] : []),
      ];
      return state.menuField
        ? renderListFieldWithContext(context, state.menuField, bodyRows, cols)
        : context;
    }
    case 'language':
    case 'icon':
    case 'color':
      return state.subField?.render(bodyRows, cols) ?? [];
    case 'about': {
      const context = [
        ...(state.aboutLines ?? []).flatMap((line) => (
          line ? wrappedIndentedLines(line, cols, (value) => value) : ['']
        )),
        '',
      ];
      if (!state.backField) return context;
      const fieldLines = state.backField.render(Number.POSITIVE_INFINITY, cols);
      if (!Number.isFinite(bodyRows) || context.length + fieldLines.length <= bodyRows) {
        return [...context, ...fieldLines];
      }
      const rows = Math.max(0, Math.floor(bodyRows));
      const visibleField = fieldLines.length <= rows
        ? fieldLines
        : state.backField.render(rows, cols);
      const content = context.at(-1) === '' ? context.slice(0, -1) : context;
      return content.length > 0
        ? [...visibleField, '', ...content]
        : visibleField;
    }
    default:
      return [];
  }
}
