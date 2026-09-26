export interface HtmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: HtmlNode[];
  readonly content?: HtmlElement;
}

type HtmlNode = HtmlElement | string;

const words = (list: string) => new Set(list.split(' '));
const VOID = words(
  'area base basefont bgsound br col embed frame hr img input keygen link meta param source track wbr',
);
const RAW_TEXT = words('style xmp iframe noembed noframes noscript');
const ESCAPABLE_RAW_TEXT = words('textarea title');
const LEADING_NEWLINE = words('pre listing textarea');
const IGNORED = words('html head body');
const IN_SELECT = words('option optgroup select template');
const SELECT_CONTENT = words('option optgroup script style template');
const SELECT_BREAKERS = words('select input keygen textarea');
const TABLE_ONLY = words('caption col colgroup frame frameset tbody td tfoot th thead tr');
const CLOSES_P = words(
  'address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li dd dt listing main menu nav ol p pre search section summary ul xmp plaintext',
);
const SCOPE = words('applet caption html table td th marquee object template');
const SPECIAL = new Set([
  ...CLOSES_P,
  ...SCOPE,
  ...words('button colgroup frameset select tbody tfoot thead tr'),
]);
const LIST_TRANSPARENT = words('address div p');
const FORMATTING = words('a b big code em font i nobr s small strike strong tt u');
const IMPLIED_END = words('p li dd dt option optgroup rb rp rt rtc');
const TABLE = words('table tbody tfoot thead tr');
const HEADING = /^h[1-6]$/;
const MAX_DEPTH = 512;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};
const LEGACY = ['amp', 'lt', 'gt', 'quot', 'nbsp'];
const WINDOWS_1252 = new TextDecoder('windows-1252');

const ENTITY = /&(?:#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?|([a-zA-Z][a-zA-Z0-9]*)(;?))/g;
const WHITESPACE = /[\t\n\f\r ]/;
const NAME_END = /[\t\n\f\r />]/g;
const ATTRIBUTE_NAME_END = /[\t\n\f\r />=]/g;
const UNQUOTED_END = /[\t\n\f\r >]/g;
const COMMENT_END = /--!?>/g;
const SCRIPT_STATES = [
  /<!--|<\/script[\t\n\f\r />]/gi,
  /-->|<\/?script[\t\n\f\r />]/gi,
  /-->|<\/script[\t\n\f\r />]/gi,
] as const;

function decodeEntities(text: string, inAttribute: boolean): string {
  return text.replace(
    ENTITY,
    (
      match,
      hex: string | undefined,
      decimal: string | undefined,
      name: string | undefined,
      semi: string,
      at: number,
      whole: string,
    ) => {
      if (name === undefined) {
        const code = hex === undefined ? Number(decimal) : Number.parseInt(hex, 16);
        if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
        return code >= 0x80 && code <= 0x9f
          ? WINDOWS_1252.decode(Uint8Array.of(code))
          : String.fromCodePoint(code);
      }
      if (semi && NAMED[name] !== undefined) return NAMED[name];
      const legacy = LEGACY.find((candidate) => name.startsWith(candidate));
      if (legacy === undefined) return match;
      const next = name.length > legacy.length ? name[legacy.length] : whole[at + match.length];
      if (inAttribute && next !== undefined && /[a-zA-Z0-9=]/.test(next)) return match;
      return `${NAMED[legacy] ?? ''}${match.slice(legacy.length + 1)}`;
    },
  );
}

function search(pattern: RegExp, html: string, from: number): RegExpExecArray | null {
  pattern.lastIndex = from;
  return pattern.exec(html);
}

function indexOf(pattern: RegExp, html: string, from: number): number {
  return search(pattern, html, from)?.index ?? html.length;
}

function scriptEnd(html: string, from: number): number {
  let state: 0 | 1 | 2 = 0;
  for (let found = search(SCRIPT_STATES[0], html, from); found !== null;) {
    const token = found[0].toLowerCase();
    if (token.startsWith('</script') && state !== 2) return found.index;
    state = token === '<!--' ? 1 : token === '-->' ? 0 : token.startsWith('<script') ? 2 : 1;
    const next = found.index + (token === '<!--' ? 2 : token.length);
    found = search(SCRIPT_STATES[state], html, next);
  }
  return html.length;
}

export function parseHtml(source: string): HtmlElement {
  const html = source.replace(/\r\n?/g, '\n');
  const root: HtmlElement = { name: '#document', attributes: new Map(), children: [] };
  const stack: HtmlElement[] = [root];
  let form: HtmlElement | undefined;
  const openCount = new Map<string, number>();
  const count = (name: string, delta: number) =>
    openCount.set(name, (openCount.get(name) ?? 0) + delta);
  const isOpen = (name: string) => (openCount.get(name) ?? 0) > 0;
  const current = () => stack[stack.length - 1] ?? root;
  const truncate = (length: number) => {
    for (const element of stack.splice(length)) count(element.name, -1);
  };
  const closeInScope = (names: string[], boundary: (name: string) => boolean) => {
    if (!names.some(isOpen)) return;
    for (let index = stack.length - 1; index > 0; index -= 1) {
      const name = stack[index]?.name ?? '';
      if (names.includes(name)) truncate(index);
      if (names.includes(name) || boundary(name)) return;
    }
  };
  const listBoundary = (name: string) => SPECIAL.has(name) && !LIST_TRANSPARENT.has(name);
  const closeP = () => {
    closeInScope(['p'], (name) => SCOPE.has(name) || name === 'button');
  };

  let position = 0;
  while (position < html.length) {
    const open = html.indexOf('<', position);
    const text = decodeEntities(html.slice(position, open === -1 ? html.length : open), false);
    if (text) current().children.push(text);
    if (open === -1) break;
    position = open;
    const next = html[open + 1] ?? '';
    if (html.startsWith('<!--', open)) {
      const body = open + 4;
      const closer = html.startsWith('>', body)
        ? body
        : html.startsWith('->', body)
          ? body + 1
          : indexOf(COMMENT_END, html, body);
      position = closer >= html.length ? html.length : html.indexOf('>', closer) + 1;
      continue;
    }
    const isEnd = next === '/';
    const nameStart = open + (isEnd ? 2 : 1);
    if (!/[a-zA-Z]/.test(html[nameStart] ?? '')) {
      if (next === '!' || next === '?' || (isEnd && nameStart < html.length)) {
        const close = html.indexOf('>', open);
        position = close === -1 ? html.length : close + 1;
      } else {
        current().children.push('<');
        position = open + 1;
      }
      continue;
    }

    let cursor = indexOf(NAME_END, html, nameStart);
    const name = html.slice(nameStart, cursor).toLowerCase();
    const attributes = new Map<string, string>();
    let complete = false;
    while (cursor < html.length) {
      const char = html[cursor] ?? '';
      if (char === '>') {
        complete = true;
        cursor += 1;
        break;
      }
      if (WHITESPACE.test(char) || char === '/') {
        cursor += 1;
        continue;
      }
      const attributeEnd = indexOf(ATTRIBUTE_NAME_END, html, cursor + 1);
      const attribute = html.slice(cursor, attributeEnd).toLowerCase();
      cursor = attributeEnd;
      while (WHITESPACE.test(html[cursor] ?? '')) cursor += 1;
      let value = '';
      if (html[cursor] === '=') {
        cursor += 1;
        while (WHITESPACE.test(html[cursor] ?? '')) cursor += 1;
        const quote = html[cursor] ?? '';
        const quoted = quote === '"' || quote === "'";
        const valueEnd = quoted
          ? html.indexOf(quote, cursor + 1)
          : indexOf(UNQUOTED_END, html, cursor);
        if (valueEnd === -1) break;
        value = html.slice(quoted ? cursor + 1 : cursor, valueEnd);
        cursor = quoted ? valueEnd + 1 : valueEnd;
      }
      if (!attributes.has(attribute)) attributes.set(attribute, decodeEntities(value, true));
    }
    if (!complete) break;
    position = cursor;

    const inSelect = isOpen('select');
    if (inSelect && (isEnd ? !IN_SELECT.has(name) : !SELECT_CONTENT.has(name))) {
      if (isEnd || !SELECT_BREAKERS.has(name)) continue;
      closeInScope(['select'], () => false);
      if (name === 'select') continue;
    }
    if (isEnd) {
      if (name === 'form') {
        const index = form === undefined ? -1 : stack.lastIndexOf(form);
        form = undefined;
        if (index > 0 && !stack.slice(index + 1).some((open) => SCOPE.has(open.name))) {
          while (IMPLIED_END.has(current().name)) truncate(stack.length - 1);
          stack.splice(index, 1);
          count('form', -1);
        }
      } else if (name === 'p') {
        closeP();
      } else if (!IGNORED.has(name)) {
        const scoped = SPECIAL.has(name) || FORMATTING.has(name);
        closeInScope([name], (open) => (scoped ? SCOPE : SPECIAL).has(open));
      }
      continue;
    }
    if (IGNORED.has(name) || (name === 'form' && form !== undefined)) continue;
    if (TABLE_ONLY.has(name) && !isOpen('table')) continue;
    if (name === 'li') closeInScope(['li'], listBoundary);
    if (name === 'dd' || name === 'dt') closeInScope(['dd', 'dt'], listBoundary);
    if (name === 'button' || name === 'a' || name === 'nobr')
      closeInScope([name], (open) => SCOPE.has(open));
    if (CLOSES_P.has(name)) closeP();
    if (HEADING.test(name) && HEADING.test(current().name)) truncate(stack.length - 1);
    if ((name === 'option' || name === 'optgroup') && current().name === 'option')
      truncate(stack.length - 1);
    const parent = current();
    const element: HtmlElement =
      name === 'template'
        ? { name, attributes, children: [], content: { name, attributes: new Map(), children: [] } }
        : { name, attributes, children: [] };
    parent.children.push(element);
    if (name === 'form') form = element;
    if (LEADING_NEWLINE.has(name) && html[position] === '\n') position += 1;
    if (
      name === 'script' ||
      name === 'plaintext' ||
      RAW_TEXT.has(name) ||
      ESCAPABLE_RAW_TEXT.has(name)
    ) {
      const close =
        name === 'script'
          ? scriptEnd(html, position)
          : name === 'plaintext'
            ? html.length
            : indexOf(new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'gi'), html, position);
      const content = html.slice(position, close);
      if (content)
        element.children.push(
          ESCAPABLE_RAW_TEXT.has(name) ? decodeEntities(content, false) : content,
        );
      position = close;
    } else if (
      !VOID.has(name) &&
      !(name === 'form' && TABLE.has(parent.name)) &&
      stack.length < MAX_DEPTH
    ) {
      stack.push(element.content ?? element);
      count(name, 1);
    }
  }
  return root;
}

function* descendants(element: HtmlElement, templates = true): Generator<HtmlNode> {
  const pending: HtmlNode[] = [];
  const enqueue = ({ children, content }: HtmlElement) => {
    const all = templates && content ? [...children, ...content.children] : [...children];
    for (const child of all.reverse()) pending.push(child);
  };
  enqueue(element);
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    yield node;
    if (typeof node !== 'string') enqueue(node);
  }
}

export function elements(element: HtmlElement, templates = true): HtmlElement[] {
  return [...descendants(element, templates)].filter(
    (node): node is HtmlElement => typeof node !== 'string',
  );
}

export function outermost(
  root: HtmlElement,
  match: (element: HtmlElement) => boolean,
): HtmlElement[] {
  const inside = new Set<HtmlElement>();
  const found: HtmlElement[] = [];
  for (const element of elements(root)) {
    if (inside.has(element) || !match(element)) continue;
    found.push(element);
    for (const descendant of elements(element)) inside.add(descendant);
  }
  return found;
}

export function textContent(element: HtmlElement): string {
  return [...descendants(element)].filter((node) => typeof node === 'string').join('');
}
