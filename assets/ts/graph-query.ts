/** The public, published fields that the graph is allowed to search. */
export interface SearchDocument {
  id?: string;
  title?: string;
  file?: string;
  path?: string;
  tags?: string[];
  text?: string;
  lines?: string[];
  sections?: string[];
  properties?: Record<string, null | string | number | boolean | (string | number | boolean | null)[]>;
}

export interface CompiledQuery {
  matches(document: SearchDocument): boolean;
  /** False means that the query can run before graph-search.json is loaded. */
  needsIndex: boolean;
}

type Field = 'path' | 'file' | 'tag' | 'line' | 'section';
type Expression =
  | { kind: 'all' }
  | { kind: 'text'; value: string }
  | { kind: 'property'; key: string; value?: string }
  | { kind: 'field'; field: Field; expression: Expression }
  | { kind: 'not'; expression: Expression }
  | { kind: 'and' | 'or'; expressions: Expression[] };
type TokenKind = 'word' | 'quoted' | 'property' | 'or' | '(' | ')' | ':' | '-' | 'end';
interface Token { kind: TokenKind; value: string; position: number }

const fields = new Set<Field>(['path', 'file', 'tag', 'line', 'section']);
const lower = (value: string): string => value.toLowerCase();
const syntaxError = (message: string, position: number): Error => new Error(`${message}（位置 ${position + 1}）`);

function readQuoted(input: string, start: number): { value: string; end: number } {
  let value = '';
  for (let position = start + 1; position < input.length; position++) {
    const char = input[position]!;
    if (char === '"') return { value, end: position + 1 };
    if (char === '\\') {
      if (position + 1 >= input.length) throw syntaxError('引号内的转义字符不完整', position);
      value += input[++position]!;
    } else value += char;
  }
  throw syntaxError('缺少结束引号', start);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < input.length) {
    const char = input[position]!;
    if (/\s/.test(char)) { position++; continue; }
    const start = position;
    if (char === '"') {
      const quoted = readQuoted(input, position);
      tokens.push({ kind: 'quoted', value: quoted.value, position });
      position = quoted.end;
    } else if (char === '[') {
      position++;
      while (position < input.length && input[position] !== ']') {
        if (input[position] === '"') position = readQuoted(input, position).end;
        else if (input[position] === '[') throw syntaxError('属性条件不能嵌套方括号', position);
        else if (input[position] === '\\') position += 2;
        else position++;
      }
      if (input[position] !== ']') throw syntaxError('缺少结束方括号 ]', start);
      tokens.push({ kind: 'property', value: input.slice(start + 1, position), position: start });
      position++;
    } else if (char === ']') throw syntaxError('没有对应的开始方括号 [', position);
    else if (char === '(' || char === ')' || char === ':' || char === '-') {
      tokens.push({ kind: char, value: char, position });
      position++;
    } else {
      let value = '';
      while (position < input.length && !/[\s()[\]":]/.test(input[position]!)) {
        if (input[position] === '\\') {
          if (position + 1 >= input.length) throw syntaxError('转义字符不完整', position);
          position++;
        }
        value += input[position++]!;
      }
      tokens.push({ kind: /^OR$/i.test(value) ? 'or' : 'word', value, position: start });
    }
  }
  tokens.push({ kind: 'end', value: '', position: input.length });
  return tokens;
}

function validateLiteral(value: string, quoted: boolean, position: number): string {
  if (!value.length) throw syntaxError('搜索条件不能为空', position);
  if (!quoted && /^\/.*\/[a-z]*$/i.test(value)) throw syntaxError('暂不支持正则表达式，请使用普通词或引号短语', position);
  if (!quoted && /^[<>=]/.test(value)) throw syntaxError('暂不支持数值比较', position);
  return lower(value);
}

function parseProperty(token: Token): Expression {
  let separator = -1;
  for (let position = 0; position < token.value.length; position++) {
    if (token.value[position] === '"') position = readQuoted(token.value, position).end - 1;
    else if (token.value[position] === '\\') position++;
    else if (token.value[position] === ':') { separator = position; break; }
  }
  function part(raw: string): string {
    const value = raw.trim();
    if (value.startsWith('"')) {
      const quoted = readQuoted(value, 0);
      if (quoted.end !== value.length) throw syntaxError('属性名称或值的引号后有多余内容', token.position);
      return validateLiteral(quoted.value, true, token.position);
    }
    if (value.includes('"')) throw syntaxError('请用引号包住整个属性名称或值', token.position);
    return validateLiteral(value.replace(/\\(.)/g, '$1'), false, token.position);
  }
  return {
    kind: 'property',
    key: part(separator < 0 ? token.value : token.value.slice(0, separator)),
    ...(separator < 0 ? {} : { value: part(token.value.slice(separator + 1)) }),
  };
}

class Parser {
  private position = 0;
  constructor(private readonly tokens: Token[]) {}
  private current(): Token { return this.tokens[this.position]!; }
  private consume(): Token { return this.tokens[this.position++]!; }

  parse(): Expression {
    if (this.current().kind === 'end') return { kind: 'all' };
    const expression = this.parseOr(0);
    if (this.current().kind !== 'end') throw syntaxError('此处有多余的符号或括号', this.current().position);
    return expression;
  }

  private parseOr(depth: number): Expression {
    const expressions = [this.parseAnd(depth)];
    while (this.current().kind === 'or') {
      this.consume();
      expressions.push(this.parseAnd(depth));
    }
    return expressions.length === 1 ? expressions[0]! : { kind: 'or', expressions };
  }

  private parseAnd(depth: number): Expression {
    const expressions = [this.parseUnary(depth)];
    while (!['end', ')', 'or'].includes(this.current().kind)) expressions.push(this.parseUnary(depth));
    return expressions.length === 1 ? expressions[0]! : { kind: 'and', expressions };
  }

  private parseUnary(depth: number): Expression {
    const token = this.current();
    if (depth > 64) throw syntaxError('条件嵌套过深，请简化查询', token.position);
    if (token.kind === '-') {
      this.consume();
      return { kind: 'not', expression: this.parseUnary(depth + 1) };
    }
    if (token.kind === '(') {
      this.consume();
      const expression = this.parseOr(depth + 1);
      if (this.current().kind !== ')') throw syntaxError('缺少结束括号 )', token.position);
      this.consume();
      return expression;
    }
    if (token.kind === 'property') { this.consume(); return parseProperty(token); }
    if (token.kind !== 'word' && token.kind !== 'quoted') throw syntaxError('此处需要搜索词或条件', token.position);
    this.consume();
    if (token.kind === 'word' && this.current().kind === ':') {
      this.consume();
      const field = lower(token.value) as Field;
      if (!fields.has(field)) throw syntaxError(`不支持的搜索操作符 ${token.value}:`, token.position);
      return { kind: 'field', field, expression: this.parseUnary(depth + 1) };
    }
    return { kind: 'text', value: validateLiteral(token.value, token.kind === 'quoted', token.position) };
  }
}

function needsIndex(expression: Expression, metadata = false): boolean {
  switch (expression.kind) {
    case 'all': return false;
    case 'text': return !metadata;
    case 'property': return true;
    case 'field':
      return expression.field === 'line' || expression.field === 'section'
        || needsIndex(expression.expression, true);
    case 'not': return needsIndex(expression.expression, metadata);
    case 'and': case 'or': return expression.expressions.some(child => needsIndex(child, metadata));
  }
}

type MatchText = (value: string) => boolean;

/** Compile once and reuse for every graph node, including every color group. */
export function compileQuery(input: string): CompiledQuery {
  if (input.length > 16_384) throw syntaxError('查询过长，请控制在 16384 个字符以内', 16_384);
  const expression = new Parser(tokenize(input)).parse();
  return {
    needsIndex: needsIndex(expression),
    matches(document: SearchDocument): boolean {
      const file = lower(document.file ?? document.title ?? '');
      const title = lower(document.title ?? '');
      let text: string | undefined;
      let tags: string[] | undefined;
      let properties: Map<string, unknown> | undefined;
      const plain: MatchText = value => {
        if (file.includes(value) || title.includes(value)) return true;
        text ??= lower(document.text ?? document.lines?.join('\n') ?? document.sections?.join('\n') ?? '');
        return text.includes(value);
      };
      const within = (value: string): MatchText => {
        const normalized = lower(value);
        return needle => normalized.includes(needle);
      };
      const evaluate = (node: Expression, match: MatchText): boolean => {
        switch (node.kind) {
          case 'all': return true;
          case 'text': return match(node.value);
          case 'not': return !evaluate(node.expression, match);
          case 'and': return node.expressions.every(child => evaluate(child, match));
          case 'or': return node.expressions.some(child => evaluate(child, match));
          case 'property': {
            properties ??= new Map(Object.entries(document.properties ?? {}).map(([key, value]) => [lower(key), value]));
            if (!properties.has(node.key)) return false;
            if (node.value === undefined) return true;
            const value = properties.get(node.key);
            return (Array.isArray(value) ? value : [value]).some(item => item !== null && item !== undefined
              && lower(String(item)).includes(node.value!));
          }
          case 'field': {
            if (node.field === 'file') return evaluate(node.expression, within(document.file ?? document.title ?? ''));
            if (node.field === 'path') return evaluate(node.expression, within(document.path ?? ''));
            if (node.field === 'tag') {
              tags ??= (document.tags ?? []).map(tag => lower(tag.replace(/^#/, '')));
              return evaluate(node.expression, value => {
                const tag = value.replace(/^#/, '');
                return tags!.some(candidate => candidate === tag || candidate.startsWith(`${tag}/`));
              });
            }
            const parts = node.field === 'line'
              ? document.lines ?? document.text?.split(/\r?\n/) ?? []
              : document.sections ?? (document.text === undefined ? [] : [document.text]);
            return parts.some(part => evaluate(node.expression, within(part)));
          }
        }
      };
      return evaluate(expression, plain);
    },
  };
}
