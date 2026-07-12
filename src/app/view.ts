import type { ViewId } from './keys.js';

export interface AppSize { rows: number; cols: number; }

export interface AppContext {
  size: AppSize;
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
  /** View-local keys (global keys are handled before this). */
  handleKey?(key: string, ctx: AppContext): void;
}
