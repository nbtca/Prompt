import { renderInput, applyInputEvent, parseInputData } from '../../core/components/text-input.js';

export interface TextFieldConfig {
  message: string;
  placeholder?: string;
  secret?: boolean;
  mask?: string;
  allowEmpty?: boolean;
}

export interface TextFieldResult {
  submitted?: string;
  cancelled?: boolean;
}

export class TextField {
  private value = '';

  constructor(private readonly config: TextFieldConfig) {}

  get currentValue(): string {
    return this.value;
  }

  render(cols = Number.POSITIVE_INFINITY): string[] {
    return renderInput({
      message: this.config.message,
      value: this.value,
      ...(this.config.placeholder === undefined ? {} : { placeholder: this.config.placeholder }),
      ...(this.config.secret === undefined ? {} : { secret: this.config.secret }),
      ...(this.config.mask === undefined ? {} : { mask: this.config.mask }),
      cols,
    }).split('\n');
  }

  handleKey(key: string): TextFieldResult {
    const ev = parseInputData(key);
    if (ev.type === 'cancel') return { cancelled: true };
    if (ev.type === 'enter') {
      if (this.value.length > 0 || this.config.allowEmpty === true)
        return { submitted: this.value };
      return {};
    }
    this.value = applyInputEvent(this.value, ev);
    return {};
  }
}
