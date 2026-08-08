function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function formatPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function makeKeySpan(key: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "key";
  span.textContent = `"${key}": `;
  return span;
}

function makeCopyButton(value: unknown): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-btn";
  btn.title = "Copy value";
  btn.textContent = "⧉";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add("copied");
      btn.textContent = "✓";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.textContent = "⧉";
      }, 1000);
    });
  });
  return btn;
}

function renderNode(key: string | null, value: unknown): HTMLElement {
  const type = valueType(value);

  if (type === "object" || type === "array") {
    const entries =
      type === "array"
        ? (value as unknown[]).map((v, i) => [String(i), v] as const)
        : Object.entries(value as Record<string, unknown>);

    const details = document.createElement("details");
    details.className = `node node-${type}`;
    details.open = true;

    const summary = document.createElement("summary");
    if (key !== null) summary.appendChild(makeKeySpan(key));
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent =
      type === "array" ? `Array[${entries.length}]` : `Object{${entries.length}}`;
    summary.appendChild(badge);
    summary.appendChild(makeCopyButton(value));
    details.appendChild(summary);

    const children = document.createElement("div");
    children.className = "children";
    for (const [childKey, childValue] of entries) {
      children.appendChild(renderNode(childKey, childValue));
    }
    details.appendChild(children);

    return details;
  }

  const leaf = document.createElement("div");
  leaf.className = "node leaf";
  if (key !== null) leaf.appendChild(makeKeySpan(key));
  const val = document.createElement("span");
  val.className = `val type-${type}`;
  val.textContent = formatPrimitive(value);
  leaf.appendChild(val);
  leaf.appendChild(makeCopyButton(value));
  return leaf;
}

export function renderTree(container: HTMLElement, data: unknown): void {
  container.replaceChildren(renderNode(null, data));
}

export function setAllExpanded(container: HTMLElement, open: boolean): void {
  container.querySelectorAll("details").forEach((d) => {
    d.open = open;
  });
}

export function filterTree(container: HTMLElement, query: string): void {
  const q = query.trim().toLowerCase();
  const nodes = container.querySelectorAll<HTMLElement>(".node");

  if (q === "") {
    nodes.forEach((n) => {
      n.classList.remove("hidden", "match");
    });
    return;
  }

  nodes.forEach((n) => {
    const ownText = n.classList.contains("leaf")
      ? n.textContent?.toLowerCase() ?? ""
      : n.querySelector(":scope > summary")?.textContent?.toLowerCase() ?? "";
    n.classList.toggle("match", ownText.includes(q));
  });

  nodes.forEach((n) => {
    const hasMatchDescendant = !!n.querySelector(".match");
    const show = n.classList.contains("match") || hasMatchDescendant;
    n.classList.toggle("hidden", !show);
    if (show && n.tagName === "DETAILS") (n as HTMLDetailsElement).open = true;
  });
}
