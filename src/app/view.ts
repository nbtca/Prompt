import type { ViewId } from './keys.js';

export interface AppSize { rows: number; cols: number; }

export interface AppContext {
  size: AppSize;
  /** `size.rows` minus the chrome's header/footer line counts — how many
   * lines a view's `render()` body actually has room for. */
  bodyRows: number;
  /** Re-render the whole screen from current state (call after async data lands). */
  rerender(): void;
  /** Suspend the app (leave alt-screen), run a classic surface, then resume. */
  runClassic(fn: () => Promise<void>): Promise<void>;
  quit(): void;
}

export interface View {
  id: ViewId;
  title: string;
  /** Optional async data fetch; call ctx.rerender() when data lands. */
  load?(ctx: AppContext): Promise<void>;
  /** Body lines for the viewport (the compositor clips/pads them). */
  render(ctx: AppContext): string[];
  /** View-local keys (global keys are handled before this, unless capturesInput() is true). */
  handleKey?(key: string, ctx: AppContext): void;
  /** True while this view wants every keypress (e.g. a focused text field) —
   * global Tab/digit/Esc routing is skipped and every key goes straight to
   * handleKey. Ctrl-C still quits regardless. Defaults to false when absent. */
  capturesInput?(): boolean;
}
