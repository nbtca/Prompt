import { renderMenu, nextIndex, parseKey, type MenuOption } from '../../core/components/menu.js';

export interface ListFieldConfig {
  title: string;
  options: MenuOption[];
  footer?: string;
  initialIndex?: number;
}

export interface ListFieldResult {
  selected?: string;
  cancelled?: boolean;
}

/** Non-blocking equivalent of `runMenu`: a view holds one of these in its own
 * state and drives it from the app loop's single stdin listener via
 * `handleKey`, instead of `runMenu` attaching a second listener and blocking
 * on a Promise. */
export class ListField {
  private index: number;

  constructor(private readonly config: ListFieldConfig) {
    this.index = config.initialIndex ?? 0;
  }

  get selectedIndex(): number {
    return this.index;
  }

  render(): string[] {
    return renderMenu({
      title: this.config.title,
      options: this.config.options,
      selectedIndex: this.index,
      footer: this.config.footer,
    }).split('\n');
  }

  handleKey(key: string): ListFieldResult {
    const parsed = parseKey(key);
    if (parsed === 'cancel') return { cancelled: true };
    if (parsed === 'enter') return { selected: this.config.options[this.index]?.value };
    const next = nextIndex(this.index, parsed, this.config.options.length);
    if (next !== this.index) this.index = next;
    return {};
  }
}
