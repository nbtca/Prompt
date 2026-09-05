import type { ViewId } from './keys.js';

export interface AppSize {
  rows: number;
  cols: number;
}

export interface AppContext {
  size: AppSize;
  bodyRows: number;
  signal?: AbortSignal;
  rerender(): void;
  resetScroll(): void;
  runClassic(fn: () => Promise<void>): Promise<void>;
  quit(): void;
}

export interface View {
  id: ViewId;
  title: string;
  load?(ctx: AppContext): Promise<void>;
  dispose?(): Promise<void> | void;
  render(ctx: AppContext): string[];
  handleKey?(key: string, ctx: AppContext): void;
  /** Where the user is, outermost first; replaces the wordmark in the header. */
  contextPath?(): readonly string[] | undefined;
  isBusy?(): boolean;
  /** The body is a plain scrollable document right now, with no cursor of its own. */
  scrollsBody?(): boolean;
  capturesInput?(): boolean;
  capturesPageKeys?(): boolean;
  handleBack?(ctx: AppContext): boolean;
  footerHint?(tabCount: number, cols: number): string | undefined;
}
