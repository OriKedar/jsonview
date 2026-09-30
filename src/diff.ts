export type DiffStatus = "same" | "added" | "removed" | "changed";

export interface DiffNode {
  /** Object key or array index; null for the root. */
  key: string | null;
  /** JSONPath-style location, e.g. `$.meta.stars` or `$.tags[2]`. */
  path: string;
  status: DiffStatus;
  /** True when both sides exist but their JSON types differ (e.g. null -> number). */
  typeChanged: boolean;
  /** Value in version A; undefined when the path is missing there. */
  a?: unknown;
  /** Value in version B; undefined when the path is missing there. */
  b?: unknown;
  /**
   * Set for objects/arrays present on both sides, and for added/removed
   * containers (every child then carries the same status). Absent on leaves and
   * on values whose type changed, which are reported as one whole-value change.
   */
  children?: DiffNode[];
  /**
   * Number of changes in this subtree, counting an added/removed subtree or a
   * replaced value once. Descendants of an added/removed node report 0, so
   * callers that hide unchanged nodes should test `status !== "same"` as well.
   */
  changeCount: number;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  total: number;
}

type JsonType = "null" | "array" | "object" | "string" | "number" | "boolean";

function jsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonType;
}

function isContainer(type: JsonType): boolean {
  return type === "object" || type === "array";
}

function entriesOf(value: unknown, type: JsonType): [string, unknown][] {
  return type === "array"
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function childPath(parent: string, key: string, parentType: JsonType): string {
  if (parentType === "array") return `${parent}[${key}]`;
  return IDENTIFIER.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function oneSided(
  key: string | null,
  path: string,
  value: unknown,
  status: "added" | "removed",
  counted: boolean,
): DiffNode {
  const node: DiffNode = {
    key,
    path,
    status,
    typeChanged: false,
    changeCount: counted ? 1 : 0,
  };
  if (status === "added") node.b = value;
  else node.a = value;

  const type = jsonType(value);
  if (isContainer(type)) {
    node.children = entriesOf(value, type).map(([k, v]) =>
      oneSided(k, childPath(path, k, type), v, status, false),
    );
  }
  return node;
}

function compare(key: string | null, path: string, a: unknown, b: unknown): DiffNode {
  const ta = jsonType(a);
  const tb = jsonType(b);

  if (ta === tb && isContainer(ta)) {
    const entriesA = entriesOf(a, ta);
    const entriesB = new Map(entriesOf(b, tb));
    const children: DiffNode[] = [];

    for (const [k, va] of entriesA) {
      const p = childPath(path, k, ta);
      if (entriesB.has(k)) children.push(compare(k, p, va, entriesB.get(k)));
      else children.push(oneSided(k, p, va, "removed", true));
    }
    const keysA = new Set(entriesA.map(([k]) => k));
    for (const [k, vb] of entriesB) {
      if (!keysA.has(k)) {
        children.push(oneSided(k, childPath(path, k, tb), vb, "added", true));
      }
    }

    const changeCount = children.reduce((sum, c) => sum + c.changeCount, 0);
    return {
      key,
      path,
      status: changeCount > 0 ? "changed" : "same",
      typeChanged: false,
      a,
      b,
      children,
      changeCount,
    };
  }

  const same = ta === tb && a === b;
  return {
    key,
    path,
    status: same ? "same" : "changed",
    typeChanged: ta !== tb,
    a,
    b,
    changeCount: same ? 0 : 1,
  };
}

/** Structural diff of two parsed JSON values. Object key order is ignored; arrays are compared by index. */
export function diff(a: unknown, b: unknown): DiffNode {
  return compare(null, "$", a, b);
}

function walkChanges(node: DiffNode, visit: (n: DiffNode) => void): void {
  if (node.status === "same") return;
  if (node.status !== "changed" || !node.children) {
    visit(node);
    return;
  }
  for (const child of node.children) walkChanges(child, visit);
}

/** Changes in document order: each added/removed subtree and each replaced value once. */
export function listChanges(root: DiffNode): DiffNode[] {
  const out: DiffNode[] = [];
  walkChanges(root, (n) => out.push(n));
  return out;
}

export function summarize(root: DiffNode): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, changed: 0, total: 0 };
  for (const n of listChanges(root)) {
    if (n.status === "added") summary.added++;
    else if (n.status === "removed") summary.removed++;
    else summary.changed++;
    summary.total++;
  }
  return summary;
}
