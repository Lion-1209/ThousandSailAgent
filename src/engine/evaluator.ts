export interface EvalContext {
  input: Record<string, string>;
  stepOutputs: Record<string, string>;
  stepStatuses: Record<string, string>;
}

/**
 * Evaluate a condition expression against the current workflow context.
 * Returns true if no condition is provided (unconditional execution).
 *
 * Supported syntax:
 *   input.xxx == "value"        — input param equality
 *   input.xxx != "value"        — input param inequality
 *   steps.xxx.status == "value" — step status check
 *   steps.xxx.output contains "text" — output text check
 *   && || ! ()                  — boolean combinators
 */
export function evaluateCondition(condition: string | undefined, ctx: EvalContext): boolean {
  if (!condition) return true;

  const resolveRef = (ref: string): string | null => {
    const inputMatch = ref.match(/^input\.(\w+)$/);
    if (inputMatch) return ctx.input[inputMatch[1]] ?? null;

    const statusMatch = ref.match(/^steps\.(\w+)\.status$/);
    if (statusMatch) return ctx.stepStatuses[statusMatch[1]] ?? null;

    const outputMatch = ref.match(/^steps\.(\w+)\.output$/);
    if (outputMatch) return ctx.stepOutputs[outputMatch[1]] ?? null;

    return null;
  };

  const tokens = tokenize(condition);
  let pos = 0;

  function peek(): string | null {
    return pos < tokens.length ? tokens[pos] : null;
  }

  function consume(): string {
    if (pos >= tokens.length) throw new Error(`Unexpected end of expression: "${condition}"`);
    return tokens[pos++];
  }

  function parseOr(): boolean {
    let left = parseAnd();
    while (peek() === '||') {
      consume();
      const right = parseAnd();
      left = left || right;
    }
    return left;
  }

  function parseAnd(): boolean {
    let left = parseNot();
    while (peek() === '&&') {
      consume();
      const right = parseNot();
      left = left && right;
    }
    return left;
  }

  function parseNot(): boolean {
    if (peek() === '!') {
      consume();
      return !parseNot();
    }
    return parsePrimary();
  }

  function parsePrimary(): boolean {
    if (peek() === '(') {
      consume();
      const result = parseOr();
      if (peek() !== ')') throw new Error(`Expected ")" in: "${condition}"`);
      consume();
      return result;
    }

    const left = consume();

    const op = peek();
    if (op === '==' || op === '!=') {
      consume();
      const right = consume();

      const leftVal = isQuoted(left) ? unquote(left) : resolveRef(left);
      const rightVal = isQuoted(right) ? unquote(right) : resolveRef(right);

      if (leftVal === null || rightVal === null) return false;

      return op === '==' ? leftVal === rightVal : leftVal !== rightVal;
    }

    if (op === 'contains') {
      consume();
      const right = consume();

      const leftVal = isQuoted(left) ? unquote(left) : resolveRef(left);
      const rightVal = isQuoted(right) ? unquote(right) : resolveRef(right);

      if (leftVal === null || rightVal === null) return false;

      return leftVal.includes(rightVal);
    }

    throw new Error(`Unexpected token "${left}" in condition: "${condition}"`);
  }

  const result = parseOr();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token "${tokens[pos]}" after expression: "${condition}"`);
  }
  return result;
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < expr.length) {
    if (/\s/.test(expr[i])) { i++; continue; }

    if (expr.slice(i, i + 2) === '==') { tokens.push('=='); i += 2; continue; }
    if (expr.slice(i, i + 2) === '!=') { tokens.push('!='); i += 2; continue; }
    if (expr.slice(i, i + 2) === '&&') { tokens.push('&&'); i += 2; continue; }
    if (expr.slice(i, i + 2) === '||') { tokens.push('||'); i += 2; continue; }

    if (expr[i] === '!' || expr[i] === '(' || expr[i] === ')') {
      tokens.push(expr[i]); i++; continue;
    }

    if (expr[i] === '"') {
      let str = '"';
      i++;
      while (i < expr.length && expr[i] !== '"') {
        if (expr[i] === '\\' && i + 1 < expr.length) { str += expr[i + 1]; i += 2; }
        else { str += expr[i]; i++; }
      }
      if (i < expr.length) { str += '"'; i++; }
      tokens.push(str);
      continue;
    }

    if (/[a-zA-Z_.]/.test(expr[i])) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_.]/.test(expr[i])) {
        ident += expr[i]; i++;
      }
      tokens.push(ident);
      continue;
    }

    throw new Error(`Unexpected character "${expr[i]}" at position ${i} in: "${expr}"`);
  }

  return tokens;
}

function isQuoted(s: string): boolean {
  return s.startsWith('"') && s.endsWith('"');
}

function unquote(s: string): string {
  return s.slice(1, -1);
}
