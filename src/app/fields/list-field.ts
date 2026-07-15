import { renderMenu, nextIndex, parseKey, type MenuOption } from '../../core/components/menu.js';
import { space, type } from '../../core/theme.js';
import { t, fmt } from '../../i18n/index.js';

export interface ListFieldConfig {
  title: string;
  options: MenuOption[];
  footer?: string;
  initialIndex?: number;
  /** Max option rows visible at once. When set and options.length exceeds
   * it, the field scrolls to keep the selection in view and shows a count
   * of items above/below. Omit to always render every option — fine for
   * short, fixed menus that can never overflow the viewport. */
  maxVisible?: number;
}

export interface ListFieldResult {
  selected?: string;
  cancelled?: boolean;
}

/** A conservative rows-to-options budget for a ListField that fills a
 * view's whole body (title + blank + up to N options + an optional
 * more-indicator + footer). Reserves ~4 lines for that non-option chrome
 * so the field never itself overflows `bodyRows`. */
export function computeMaxVisible(bodyRows: number): number {
  return Math.max(3, bodyRows - 4);
}

/** Non-blocking equivalent of `runMenu`: a view holds one of these in its own
 * state and drives it from the app loop's single stdin listener via
 * `handleKey`, instead of `runMenu` attaching a second listener and blocking
 * on a Promise. */
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

  /** Updates the visible-row budget in place (re-clamping the scroll window
   * so the selection stays visible) instead of losing the field's current
   * selection/scroll by rebuilding it. Views call this from their own
   * `render(ctx)` on every frame — cheap, and it's what keeps a field's
   * window in sync with the *current* terminal size even though the field
   * itself was constructed against whatever size was current at the time. */
  setMaxVisible(maxVisible: number | undefined): void {
    this.maxVisible = maxVisible;
    this.clampScroll();
  }

  render(): string[] {
    const { title, options, footer } = this.config;
    const maxVisible = this.maxVisible;
    if (!maxVisible || options.length <= maxVisible) {
      return renderMenu({ title, options, selectedIndex: this.index, footer }).split('\n');
    }

    const visible = options.slice(this.scrollTop, this.scrollTop + maxVisible);
    const lines = renderMenu({
      title,
      options: visible,
      selectedIndex: this.index - this.scrollTop,
    }).split('\n');

    const above = this.scrollTop;
    const below = options.length - (this.scrollTop + visible.length);
    if (above > 0 || below > 0) {
      const trans = t();
      const parts = [
        above > 0 ? fmt(trans.common.moreAbove, { count: above }) : null,
        below > 0 ? fmt(trans.common.moreBelow, { count: below }) : null,
      ].filter((part): part is string => part !== null);
      lines.push(`${space.indent}${type.hint(parts.join('  ·  '))}`);
    }
    if (footer) lines.push('', `${space.indent}${type.hint(footer)}`);
    return lines;
  }

  handleKey(key: string): ListFieldResult {
    const parsed = parseKey(key);
    if (parsed === 'cancel') return { cancelled: true };
    if (parsed === 'enter') return { selected: this.config.options[this.index]?.value };
    const next = nextIndex(this.index, parsed, this.config.options.length);
    if (next !== this.index) {
      this.index = next;
      this.clampScroll();
    }
    return {};
  }

  /** Keeps `index` within [scrollTop, scrollTop + maxVisible) after any move
   * or after maxVisible itself changes (e.g. a terminal resize). */
  private clampScroll(): void {
    const maxVisible = this.maxVisible;
    if (!maxVisible) { this.scrollTop = 0; return; }
    if (this.index < this.scrollTop) this.scrollTop = this.index;
    else if (this.index >= this.scrollTop + maxVisible) this.scrollTop = this.index - maxVisible + 1;
    // The window may also need to slide backward if it shrank enough that
    // scrollTop..scrollTop+maxVisible now runs past the end of the list.
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, Math.max(0, this.config.options.length - maxVisible)));
  }
}
