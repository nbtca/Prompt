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
  capturesInput?(): boolean;
  capturesPageKeys?(): boolean;
  handleBack?(ctx: AppContext): boolean;
  footerHint?(tabCount: number, cols: number): string | undefined;
}
