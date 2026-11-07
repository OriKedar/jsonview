import type { ParseResult } from "../parser";

const KEY_RE = /[A-Za-z_][\w.\-$]*/y;
const KEY_EQ_RE = /[A-Za-z_][\w.\-$]*=/;
const NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const NL_WS_RE = /\s*\n\s*/y;
const NL_SEP_RE = /,\s*\n\s*/y;
const NL_MAP_CLOSE_RE = /\s*\n\s*\}/y;
const NL_LIST_CLOSE_RE = /\s*\n\s*\]/y;

export function looksLikeJavaMap(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") || trimmed.startsWith("[")) && KEY_EQ_RE.test(trimmed);
}

export function parseJavaMap(text: string): ParseResult {
  if (text.trim() === "") {
    return { ok: false, message: "Empty input." };
  }
  const offset = text.length - text.trimStart().length;
  const src = text.trim();
  try {
    return { ok: true, value: parseSource(src) };
  } catch (e) {
    if (!(e instanceof JavaMapError)) throw e;
    const index = offset + e.index;
    const { line, column } = locate(text, index);
    return { ok: false, message: e.message, index, line, column };
  }
}

export function formatJavaMap(value: unknown, indent = 2): string {
  return formatValue(value, 0);

  function formatValue(v: unknown, depth: number): string {
    if (v === null) return "null";
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      const pad = " ".repeat(indent * (depth + 1));
      const items = v.map((item) => pad + formatValue(item, depth + 1));
      return "[\n" + items.join(",\n") + "\n" + " ".repeat(indent * depth) + "]";
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const pad = " ".repeat(indent * (depth + 1));
      const lines = entries.map(([k, item]) => pad + k + "=" + formatValue(item, depth + 1));
      return "{\n" + lines.join(",\n") + "\n" + " ".repeat(indent * depth) + "}";
    }
    return String(v);
  }
}

class JavaMapError extends Error {
  readonly index: number;
  constructor(message: string, index: number) {
    super(message);
    this.index = index;
  }
}

function parseSource(src: string): unknown {
  let pos = 0;

  const err = (message: string): JavaMapError => new JavaMapError(message, pos);

  const keyAt = (at: number): string | null => {
    KEY_RE.lastIndex = at;
    const m = KEY_RE.exec(src);
    return m ? m[0] : null;
  };

  const isKeyEqAt = (at: number): boolean => {
    const key = keyAt(at);
    return key !== null && src[at + key.length] === "=";
  };

  const matchAt = (re: RegExp, at: number): string | null => {
    re.lastIndex = at;
    const m = re.exec(src);
    return m ? m[0] : null;
  };

  const skipNewlineWs = (): void => {
    const ws = matchAt(NL_WS_RE, pos);
    if (ws !== null) pos += ws.length;
  };

  function parseValue(container: "map" | "list"): unknown {
    const ch = src[pos];
    if (ch === "{") return parseMap();
    if (ch === "[") return parseList();
    return parseScalar(container);
  }

  function parseMap(): Record<string, unknown> {
    pos++;
    const obj: Record<string, unknown> = {};
    skipNewlineWs();
    if (src[pos] === "}") {
      pos++;
      return obj;
    }
    for (;;) {
      if (pos >= src.length) throw err("Unclosed '{'.");
      const key = keyAt(pos);
      if (key === null) throw err("Expected key.");
      pos += key.length;
      if (src[pos] !== "=") throw err("Expected '='.");
      pos++;
      Object.defineProperty(obj, key, {
        value: parseValue("map"),
        enumerable: true,
        writable: true,
        configurable: true,
      });
      skipNewlineWs();
      if (src[pos] === "}") {
        pos++;
        return obj;
      }
      if (src.startsWith(", ", pos)) {
        pos += 2;
        continue;
      }
      const sep = matchAt(NL_SEP_RE, pos);
      if (sep !== null) {
        pos += sep.length;
        continue;
      }
      throw err(pos >= src.length ? "Unclosed '{'." : "Expected ', ' or '}'.");
    }
  }

  function parseList(): unknown[] {
    pos++;
    const arr: unknown[] = [];
    skipNewlineWs();
    if (src[pos] === "]") {
      pos++;
      return arr;
    }
    for (;;) {
      if (pos >= src.length) throw err("Unclosed '['.");
      arr.push(parseValue("list"));
      skipNewlineWs();
      if (src[pos] === "]") {
        pos++;
        return arr;
      }
      if (src.startsWith(", ", pos)) {
        pos += 2;
        continue;
      }
      const sep = matchAt(NL_SEP_RE, pos);
      if (sep !== null) {
        pos += sep.length;
        continue;
      }
      throw err(pos >= src.length ? "Unclosed '['." : "Expected ', ' or ']'.");
    }
  }

  function parseScalar(container: "map" | "list"): unknown {
    const start = pos;
    const closeRe = container === "map" ? NL_MAP_CLOSE_RE : NL_LIST_CLOSE_RE;
    while (pos < src.length) {
      const ch = src[pos];
      if (container === "map" && ch === "}") break;
      if (container === "list" && ch === "]") break;
      if (src.startsWith(", ", pos) && (container === "list" || isKeyEqAt(pos + 2))) break;
      const sep = matchAt(NL_SEP_RE, pos);
      if (sep !== null && (container === "list" || isKeyEqAt(pos + sep.length))) break;
      if (matchAt(closeRe, pos) !== null) break;
      pos++;
    }
    return typeScalar(src.slice(start, pos).replace(/\s*\n\s*$/, ""));
  }

  if (src[0] !== "{" && src[0] !== "[") {
    throw err("Expected '{' or '['.");
  }
  const value = parseValue("map");
  if (pos !== src.length) throw err("Unexpected trailing characters.");
  return value;
}

function typeScalar(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (!NUMBER_RE.test(raw)) return raw;
  const intPart = raw.replace(/^-/, "").split(/[.eE]/)[0];
  if (intPart.length > 1 && intPart.startsWith("0")) return raw;
  const isInteger = !/[.eE]/.test(raw);
  const n = Number(raw);
  if (isInteger && !Number.isSafeInteger(n)) return raw;
  return n;
}

function locate(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}
