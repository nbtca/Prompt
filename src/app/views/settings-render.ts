import { space, type } from '../../core/theme.js';
import { wrapAnsiWithIndent } from '../../core/text.js';
import { pictureBeside } from '../../core/components/picture.js';
import { gasGiantLines } from '../../art/planet.js';
import { type ListField, renderListFieldWithContext } from '../fields/list-field.js';

const ABOUT_PLANET_COLS = 28;

export type SettingsMode = 'menu' | 'language' | 'icon' | 'color' | 'picture' | 'reset' | 'about';

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
  return wrapAnsiWithIndent(style(label), cols, space.indent);
}

export function renderSettings(
  state: SettingsViewState,
  bodyRows = Number.POSITIVE_INFINITY,
  cols = Number.POSITIVE_INFINITY,
): string[] {
  switch (state.mode) {
    case 'menu': {
      const context = [
        ...(state.statusMessage
          ? [...wrappedIndentedLines(state.statusMessage, cols, type.hint), '']
          : []),
      ];
      return state.menuField
        ? renderListFieldWithContext(context, state.menuField, bodyRows, cols)
        : context;
    }
    case 'language':
    case 'icon':
    case 'color':
    case 'picture':
    case 'reset':
      return state.subField?.render(bodyRows, cols) ?? [];
    case 'about': {
      const aboutLines = state.aboutLines ?? [];
      const plain = [
        ...aboutLines.flatMap((line) =>
          line ? wrappedIndentedLines(line, cols, (value) => value) : [''],
        ),
        '',
      ];
      const picture = gasGiantLines(ABOUT_PLANET_COLS) ?? [];
      const fieldRows = state.backField?.render(Number.POSITIVE_INFINITY, cols).length ?? 0;
      const fits = (lines: readonly string[]) =>
        !Number.isFinite(bodyRows) || lines.length + fieldRows <= bodyRows;
      const beside = pictureBeside(picture, aboutLines, cols, 52);
      const stacked = [...picture.map((line) => space.indent + line), '', ...plain];
      const context =
        beside && fits([...beside, '']) ? [...beside, ''] : fits(stacked) ? stacked : plain;
      if (!state.backField) return context;
      const fieldLines = state.backField.render(Number.POSITIVE_INFINITY, cols);
      if (!Number.isFinite(bodyRows) || context.length + fieldLines.length <= bodyRows) {
        return [...context, ...fieldLines];
      }
      const rows = Math.max(0, Math.floor(bodyRows));
      const visibleField =
        fieldLines.length <= rows ? fieldLines : state.backField.render(rows, cols);
      const content = context.at(-1) === '' ? context.slice(0, -1) : context;
      return content.length > 0 ? [...visibleField, '', ...content] : visibleField;
    }
    default:
      return [];
  }
}
