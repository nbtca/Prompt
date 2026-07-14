import { space, type } from '../../core/theme.js';
import { ListField } from '../fields/list-field.js';

export type SettingsMode = 'menu' | 'language' | 'icon' | 'color' | 'about';

export interface SettingsViewState {
  mode: SettingsMode;
  menuField?: ListField;
  subField?: ListField;
  aboutLines?: string[];
  backField?: ListField;
  statusMessage?: string;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

export function renderSettings(state: SettingsViewState): string[] {
  switch (state.mode) {
    case 'menu':
      return [
        ...(state.statusMessage ? [hint(state.statusMessage), ''] : []),
        ...(state.menuField?.render() ?? []),
      ];
    case 'language':
    case 'icon':
    case 'color':
      return state.subField?.render() ?? [];
    case 'about':
      return [
        ...(state.aboutLines ?? []).map((l) => `${space.indent}${l}`),
        '',
        ...(state.backField?.render() ?? []),
      ];
    default:
      return [];
  }
}
