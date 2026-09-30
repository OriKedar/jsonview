import { listChanges, type DiffNode, type DiffStatus } from "./diff";
import { formatPrimitive, makeKeySpan, valueType } from "./tree";

const MARKS: Record<DiffStatus, string> = {
  same: "",
  added: "+",
  removed: "−",
  changed: "~",
};

export interface DiffRender {
  /** One row per entry of listChanges(), in the same order. */
  changeRows: HTMLElement[];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function gutter(status: DiffStatus): HTMLSpanElement {
  return el("span", `diff-gutter diff-gutter-${status}`, MARKS[status]);
}

function containerBadge(value: unknown): HTMLSpanElement {
  const type = valueType(value);
  const size = type === "array" ? (value as unknown[]).length : Object.keys(value as object).length;
  return el("span", "badge", type === "array" ? `Array[${size}]` : `Object{${size}}`);
}

function valueSpan(value: unknown, extraClass = ""): HTMLSpanElement {
  const type = valueType(value);
  if (type === "object" || type === "array") return containerBadge(value);
  return el("span", `val type-${type} ${extraClass}`.trim(), formatPrimitive(value));
}

function renderContainer(node: DiffNode, rows: Map<DiffNode, HTMLElement>): HTMLElement {
  const sample = node.b !== undefined ? node.b : node.a;
  const details = el("details", `node node-${valueType(sample)} diff-${node.status}`);
  if (node.key === null) details.classList.add("diff-root");
  details.open = node.status !== "same" || node.key === null;

  const summary = el("summary", "");
  summary.appendChild(gutter(node.status));
  if (node.key !== null) summary.appendChild(makeKeySpan(node.key));
  summary.appendChild(containerBadge(sample));
  if (node.status === "changed" && node.changeCount > 0) {
    summary.appendChild(el("span", "diff-count", String(node.changeCount)));
  } else if (node.status === "same" && node.key !== null) {
    summary.appendChild(el("span", "diff-hint", "unchanged"));
  }
  details.appendChild(summary);
  rows.set(node, summary);

  const children = el("div", "children");
  for (const child of node.children!) children.appendChild(renderNode(child, rows));
  details.appendChild(children);
  return details;
}

function renderLeaf(node: DiffNode, rows: Map<DiffNode, HTMLElement>): HTMLElement {
  const leaf = el("div", `node leaf diff-${node.status}`);
  if (node.key === null) leaf.classList.add("diff-root");
  leaf.appendChild(gutter(node.status));
  if (node.key !== null) leaf.appendChild(makeKeySpan(node.key));

  if (node.status === "changed") {
    leaf.appendChild(valueSpan(node.a, "val-old"));
    leaf.appendChild(el("span", "diff-arrow", " → "));
    leaf.appendChild(valueSpan(node.b));
    if (node.typeChanged) {
      leaf.appendChild(
        el("span", "diff-pill", `${valueType(node.a)} → ${valueType(node.b)}`),
      );
    }
  } else {
    leaf.appendChild(valueSpan(node.status === "removed" ? node.a : node.b));
  }

  rows.set(node, leaf);
  return leaf;
}

function renderNode(node: DiffNode, rows: Map<DiffNode, HTMLElement>): HTMLElement {
  return node.children ? renderContainer(node, rows) : renderLeaf(node, rows);
}

export function renderDiff(container: HTMLElement, root: DiffNode): DiffRender {
  const rows = new Map<DiffNode, HTMLElement>();
  container.replaceChildren(renderNode(root, rows));
  return { changeRows: listChanges(root).map((n) => rows.get(n)!) };
}
