interface Tag {
  name: string;
  closing: boolean;
  attributes: Map<string, string>;
  start: number;
  end: number;
}

const HIDDEN =
  /<!--[\s\S]*?(?:-->|$)|<(script|style|template|textarea|title|noscript|iframe|xmp|noembed|noframes)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const VOID = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'wbr']);
const TAG_NAME = /<(\/?)([a-zA-Z][^\t\n\f\r />]*)/y;
const ATTRIBUTE_NAME = /[^\t\n\f\r />=]+/y;
const SPACE = /[\t\n\f\r ]*/y;
const UNQUOTED = /[^\t\n\f\r >]*/y;
const ENTITY = /&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|(amp|lt|gt|quot|apos|nbsp)(?:;|(?![\w=])))/g;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(text: string): string {
  return text.replace(ENTITY, (match, hex?: string, decimal?: string, name?: string) => {
    if (name) return NAMED[name] ?? match;
    const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      ? String.fromCodePoint(code)
      : '�';
  });
}

function sticky(pattern: RegExp, html: string, at: number): string {
  pattern.lastIndex = at;
  return pattern.exec(html)?.[0] ?? '';
}

function* tags(html: string): Generator<Tag> {
  let at = html.indexOf('<');
  while (at >= 0) {
    TAG_NAME.lastIndex = at;
    const head = TAG_NAME.exec(html);
    if (!head) {
      at = html.indexOf('<', at + 1);
      continue;
    }
    const attributes = new Map<string, string>();
    let cursor = at + head[0].length;
    while (cursor < html.length && html[cursor] !== '>') {
      cursor += sticky(SPACE, html, cursor).length;
      if (html[cursor] === '/' || html[cursor] === '>') {
        if (html[cursor] === '/') cursor += 1;
        continue;
      }
      const name = sticky(ATTRIBUTE_NAME, html, cursor);
      cursor += Math.max(name.length, 1);
      cursor += sticky(SPACE, html, cursor).length;
      let value = '';
      if (html[cursor] === '=') {
        cursor += 1 + sticky(SPACE, html, cursor + 1).length;
        const quote = html[cursor];
        if (quote === '"' || quote === "'") {
          const close = html.indexOf(quote, cursor + 1);
          if (close < 0) return;
          value = html.slice(cursor + 1, close);
          cursor = close + 1;
        } else {
          value = sticky(UNQUOTED, html, cursor);
          cursor += value.length;
        }
      }
      const key = name.toLowerCase();
      if (name && !attributes.has(key)) attributes.set(key, decode(value));
    }
    if (cursor >= html.length) return;
    yield {
      name: (head[2] ?? '').toLowerCase(),
      closing: head[1] === '/',
      attributes,
      start: at,
      end: cursor + 1,
    };
    at = html.indexOf('<', cursor + 1);
  }
}

function visible(html: string): string {
  return html.replace(/\r\n?/g, '\n').replace(HIDDEN, '');
}

export interface LoginFormFields {
  action: string | undefined;
  execution: string;
  salt: string;
}

export function readLoginForm(source: string): LoginFormFields {
  let action: string | undefined;
  let execution: string | undefined;
  let salt: string | undefined;
  let inForm = false;
  for (const tag of tags(visible(source))) {
    const id = tag.attributes.get('id');
    if (tag.name === 'form') {
      if (tag.closing) inForm = false;
      else if (!inForm && id === 'pwdFromId') {
        inForm = true;
        action ??= tag.attributes.get('action');
      }
      continue;
    }
    if (!inForm || tag.closing) continue;
    const name = tag.attributes.get('name');
    const value = tag.name === 'input' ? (tag.attributes.get('value')?.trim() ?? '') : '';
    if (execution === undefined && (name === 'execution' || id === 'execution')) execution = value;
    if (salt === undefined && (id === 'pwdEncryptSalt' || name === 'pwdEncryptSalt')) salt = value;
  }
  return { action, execution: execution ?? '', salt: salt ?? '' };
}

export function errorText(source: string, matches: (tag: Tag) => boolean): string {
  const html = visible(source);
  const parts: string[] = [];
  let open: { name: string; depth: number } | undefined;
  let last = 0;
  for (const tag of tags(html)) {
    if (open) {
      if (tag.name === open.name) open.depth += tag.closing ? -1 : 1;
      parts.push(html.slice(last, tag.start));
      last = tag.end;
      if (open.depth === 0) open = undefined;
    } else if (!tag.closing && !VOID.has(tag.name) && matches(tag)) {
      open = { name: tag.name, depth: 1 };
      last = tag.end;
    }
  }
  if (open) parts.push(html.slice(last));
  return decode(parts.join(''));
}

export function hasId(id: string): (tag: Tag) => boolean {
  return (tag) => tag.attributes.get('id') === id;
}

export function hasClass(name: string): (tag: Tag) => boolean {
  return (tag) => (tag.attributes.get('class') ?? '').split(/[\t\n\f\r ]+/).includes(name);
}
