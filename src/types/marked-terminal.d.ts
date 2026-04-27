declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';
  import type { Chalk } from 'chalk';

  interface TerminalRendererOptions {
    code?: Chalk | ((s: string) => string);
    blockquote?: Chalk | ((s: string) => string);
    html?: Chalk | ((s: string) => string);
    heading?: Chalk | ((s: string) => string);
    firstHeading?: Chalk | ((s: string) => string);
    hr?: Chalk | ((s: string) => string);
    listitem?: Chalk | ((s: string) => string);
    table?: Chalk | ((s: string) => string);
    paragraph?: Chalk | ((s: string) => string);
    strong?: Chalk | ((s: string) => string);
    em?: Chalk | ((s: string) => string);
    codespan?: Chalk | ((s: string) => string);
    del?: Chalk | ((s: string) => string);
    link?: Chalk | ((s: string) => string);
    href?: Chalk | ((s: string) => string);
    list?: (body: string, ordered?: boolean) => string;
    width?: number;
    reflowText?: boolean;
    showSectionPrefix?: boolean;
    unescape?: boolean;
    emoji?: boolean;
    tableOptions?: unknown;
    tab?: number;
  }

  export function markedTerminal(options?: TerminalRendererOptions): MarkedExtension;
}
