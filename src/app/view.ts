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
  /** Called when Esc is pressed and the view isn't capturing input. Return
   * true if the view stepped back one level internally (e.g. a sub-screen
   * back to its own hub) — the app re-renders and stays on this tab. Return
   * false/omit if the view has nothing to step back from (already at its own
   * top level), so the app falls through to its default: back to Home. */
  handleBack?(ctx: AppContext): boolean;
  /** Overrides the chrome's generic footer hint. Return a string while the
   * generic "1-7/Tab switch · q quit" hint would be false (e.g. a focused
   * text field, where those keys type characters instead) — omit or return
   * undefined otherwise to use the generic hint. */
  footerHint?(): string | undefined;
}
