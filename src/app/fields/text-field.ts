import { renderInput, applyInputEvent, parseInputData } from '../../core/components/text-input.js';

export interface TextFieldConfig {
  message: string;
  placeholder?: string;
  secret?: boolean;
  mask?: string;
  /** Defaults to false: enter is ignored while the value is empty. */
  allowEmpty?: boolean;
}

export interface TextFieldResult {
  submitted?: string;
  cancelled?: boolean;
}

/** Non-blocking equivalent of `runTextInput`/`runSecretInput`: a view holds
 * one of these and drives it via `handleKey` from the app loop's single
 * stdin listener. Does not touch vim-key activation — the owning view is
 * responsible for `setVimKeysActive(false)` while a TextField is focused
 * (mirrors what `runTextInput` already does for the blocking widget). */
export class TextField {
  private value = '';

  constructor(private readonly config: TextFieldConfig) {}

  get currentValue(): string {
    return this.value;
  }

  render(): string[] {
    return renderInput({
      message: this.config.message,
      value: this.value,
      placeholder: this.config.placeholder,
      secret: this.config.secret,
      mask: this.config.mask,
    }).split('\n');
  }

  handleKey(key: string): TextFieldResult {
    const ev = parseInputData(key);
    if (ev.type === 'cancel') return { cancelled: true };
    if (ev.type === 'enter') {
      if (this.value.length > 0 || this.config.allowEmpty === true) return { submitted: this.value };
      return {};
    }
    this.value = applyInputEvent(this.value, ev);
    return {};
  }
}
