declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';
  import type { ChalkInstance } from 'chalk';

  interface TerminalRendererOptions {
    code?: ChalkInstance | ((s: string) => string);
    blockquote?: ChalkInstance | ((s: string) => string);
    html?: ChalkInstance | ((s: string) => string);
    heading?: ChalkInstance | ((s: string) => string);
    firstHeading?: ChalkInstance | ((s: string) => string);
    hr?: ChalkInstance | ((s: string) => string);
    listitem?: ChalkInstance | ((s: string) => string);
    table?: ChalkInstance | ((s: string) => string);
    paragraph?: ChalkInstance | ((s: string) => string);
    strong?: ChalkInstance | ((s: string) => string);
    em?: ChalkInstance | ((s: string) => string);
    codespan?: ChalkInstance | ((s: string) => string);
    del?: ChalkInstance | ((s: string) => string);
    link?: ChalkInstance | ((s: string) => string);
    href?: ChalkInstance | ((s: string) => string);
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
