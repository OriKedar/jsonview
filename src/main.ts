import "./style.css";
import { diff, summarize } from "./diff";
import { renderDiff } from "./diffView";
import { createInputPane, type InputPane } from "./inputPane";
import { renderTree, setAllExpanded, filterTree } from "./tree";

type Mode = "viewer" | "diff";

const treeOutput = document.querySelector<HTMLDivElement>("#tree-output")!;
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const urlBtn = document.querySelector<HTMLButtonElement>("#url-btn")!;
const sampleBtn = document.querySelector<HTMLButtonElement>("#sample-btn")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear-btn")!;
const searchInput = document.querySelector<HTMLInputElement>("#search-input")!;
const expandAllBtn = document.querySelector<HTMLButtonElement>("#expand-all-btn")!;
const collapseAllBtn = document.querySelector<HTMLButtonElement>("#collapse-all-btn")!;
const divider = document.querySelector<HTMLDivElement>("#divider")!;
const inputPaneEl = document.querySelector<HTMLElement>("#input-pane")!;
const mainEl = document.querySelector<HTMLElement>("main")!;
const modeViewerBtn = document.querySelector<HTMLButtonElement>("#mode-viewer")!;
const modeDiffBtn = document.querySelector<HTMLButtonElement>("#mode-diff")!;
const viewerEditor = document.querySelector<HTMLDivElement>("#viewer-editor")!;
const diffEditors = document.querySelector<HTMLDivElement>("#diff-editors")!;
const diffBar = document.querySelector<HTMLDivElement>("#diff-bar")!;
const diffTotal = document.querySelector<HTMLSpanElement>("#diff-total")!;
const diffChips = document.querySelector<HTMLSpanElement>("#diff-chips")!;
const onlyChanges = document.querySelector<HTMLInputElement>("#only-changes")!;
const prevChangeBtn = document.querySelector<HTMLButtonElement>("#prev-change")!;
const nextChangeBtn = document.querySelector<HTMLButtonElement>("#next-change")!;
const changePos = document.querySelector<HTMLSpanElement>("#change-pos")!;
const swapBtn = document.querySelector<HTMLButtonElement>("#swap-btn")!;

const STORAGE_KEY = "jsonview:last-input";
const STORAGE_KEY_A = "jsonview:diff:a";
const STORAGE_KEY_B = "jsonview:diff:b";
const MODE_KEY = "jsonview:mode";
const ONLY_CHANGES_KEY = "jsonview:diff-only-changes";

const SAMPLE_DATA = {
  name: "Json Master",
  author: "oriKedar",
  active: true,
  tags: ["json", "viewer", "diff"],
  createdAt: 1755000000,
  updatedAt: 1790797831000,
  lastSeen: "1790797831",
  office: {
    city: "Berlin",
    location: "52.5200, 13.4050",
  },
  favoritePizza: {
    name: "Nea Pizza 1889",
    address: "Zimmerstraße 26, 10969 Berlin",
    location: "52.5076947, 13.3931087",
  },
  meta: { license: "MIT", stars: null },
};

// Second version for the diff sample: one of each kind of difference.
const { lastSeen: _lastSeen, ...sampleWithoutLastSeen } = SAMPLE_DATA;
const SAMPLE_DATA_B = {
  ...sampleWithoutLastSeen,
  version: 2,
  tags: [...SAMPLE_DATA.tags, "compare"],
  updatedAt: SAMPLE_DATA.updatedAt + 86_400_000,
  meta: { license: "MIT", stars: 42 },
};

const SAMPLE = JSON.stringify(SAMPLE_DATA, null, 2);
const SAMPLE_B = JSON.stringify(SAMPLE_DATA_B, null, 2);

let mode: Mode = localStorage.getItem(MODE_KEY) === "diff" ? "diff" : "viewer";
let ready = false;

const viewerPane = createInputPane(viewerEditor, {
  storageKey: STORAGE_KEY,
  placeholder: "Paste JSON here, drop a .json file, or click Open file…",
  initialText: localStorage.getItem(STORAGE_KEY) ?? SAMPLE,
  onChange: refresh,
});

const paneA = createInputPane(document.querySelector<HTMLDivElement>("#editor-a")!, {
  storageKey: STORAGE_KEY_A,
  placeholder: "Paste version A, or drop a .json file…",
  initialText: localStorage.getItem(STORAGE_KEY_A) ?? SAMPLE,
  onChange: refresh,
  onFocus: () => setActiveSlot("a"),
  onFile: (file) => setName("a", file.name),
});

const paneB = createInputPane(document.querySelector<HTMLDivElement>("#editor-b")!, {
  storageKey: STORAGE_KEY_B,
  placeholder: "Paste version B, or drop a .json file…",
  initialText: localStorage.getItem(STORAGE_KEY_B) ?? SAMPLE_B,
  onChange: refresh,
  onFocus: () => setActiveSlot("b"),
  onFile: (file) => setName("b", file.name),
});

type Slot = "a" | "b";
const slots: Record<Slot, { pane: InputPane; col: HTMLElement; name: HTMLElement; dot: HTMLElement }> = {
  a: {
    pane: paneA,
    col: document.querySelector<HTMLElement>("#diff-col-a")!,
    name: document.querySelector<HTMLElement>("#name-a")!,
    dot: document.querySelector<HTMLElement>("#dot-a")!,
  },
  b: {
    pane: paneB,
    col: document.querySelector<HTMLElement>("#diff-col-b")!,
    name: document.querySelector<HTMLElement>("#name-b")!,
    dot: document.querySelector<HTMLElement>("#dot-b")!,
  },
};
let activeSlot: Slot = "a";

function setActiveSlot(slot: Slot): void {
  activeSlot = slot;
  slots.a.col.classList.toggle("active", slot === "a");
  slots.b.col.classList.toggle("active", slot === "b");
}

function setName(slot: Slot, name: string): void {
  slots[slot].name.textContent = name;
}

function activePane(): InputPane {
  return mode === "viewer" ? viewerPane : slots[activeSlot].pane;
}

function setControlsEnabled(enabled: boolean): void {
  expandAllBtn.disabled = !enabled;
  collapseAllBtn.disabled = !enabled;
  searchInput.disabled = !enabled;
}

// --- diff rendering -------------------------------------------------------

let changeRows: HTMLElement[] = [];
let currentChange = -1;

function updateChangePosition(): void {
  const n = changeRows.length;
  prevChangeBtn.disabled = n === 0;
  nextChangeBtn.disabled = n === 0;
  changePos.textContent = n === 0 ? "" : `${currentChange + 1 || "–"} / ${n}`;
}

function goToChange(delta: 1 | -1): void {
  const n = changeRows.length;
  if (n === 0) return;
  changeRows[currentChange]?.classList.remove("current");
  currentChange =
    currentChange === -1 ? (delta > 0 ? 0 : n - 1) : (currentChange + delta + n) % n;
  const row = changeRows[currentChange];
  row.classList.add("current");
  for (let p = row.parentElement; p && p !== treeOutput; p = p.parentElement) {
    if (p instanceof HTMLDetailsElement) p.open = true;
  }
  row.scrollIntoView({ block: "center" });
  updateChangePosition();
}

function chip(className: string, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `diff-chip ${className}`;
  span.textContent = text;
  return span;
}

function showDiffMessage(text: string): void {
  const p = document.createElement("p");
  p.className = "diff-empty";
  p.textContent = text;
  treeOutput.replaceChildren(p);
  diffBar.hidden = true;
  changeRows = [];
  currentChange = -1;
}

function updateDots(): void {
  for (const slot of ["a", "b"] as const) {
    const { kind } = slots[slot].pane.state;
    slots[slot].dot.dataset.state = kind === "valid" ? "ok" : kind === "invalid" ? "bad" : "empty";
    slots[slot].dot.title =
      kind === "valid" ? "Valid JSON" : kind === "invalid" ? "Invalid JSON" : "Empty";
  }
}

function renderDiffMode(): void {
  updateDots();
  const a = paneA.state;
  const b = paneB.state;
  searchInput.value = "";

  if (a.kind !== "valid" || b.kind !== "valid") {
    const bad = (["a", "b"] as const).filter((s) => slots[s].pane.state.kind === "invalid");
    showDiffMessage(
      bad.length > 0
        ? `Fix the JSON error in ${bad.map((s) => s.toUpperCase()).join(" and ")} to compare.`
        : "Paste JSON into both A and B to compare.",
    );
    setControlsEnabled(false);
    return;
  }

  const root = diff(a.value, b.value);
  const summary = summarize(root);
  ({ changeRows } = renderDiff(treeOutput, root));
  currentChange = -1;

  diffBar.hidden = false;
  diffTotal.textContent =
    summary.total === 0
      ? "No differences"
      : `${summary.total} difference${summary.total === 1 ? "" : "s"}`;
  const chips: HTMLSpanElement[] = [];
  if (summary.added) chips.push(chip("diff-chip-added", `+ ${summary.added} added`));
  if (summary.removed) chips.push(chip("diff-chip-removed", `− ${summary.removed} removed`));
  if (summary.changed) chips.push(chip("diff-chip-changed", `~ ${summary.changed} changed`));
  diffChips.replaceChildren(...chips);
  updateChangePosition();
  setControlsEnabled(true);
}

function renderViewerMode(): void {
  const state = viewerPane.state;
  if (state.kind === "valid") {
    renderTree(treeOutput, state.value);
    setControlsEnabled(true);
    searchInput.value = "";
  } else {
    treeOutput.replaceChildren();
    setControlsEnabled(false);
  }
}

function refresh(): void {
  if (!ready) return;
  if (mode === "viewer") renderViewerMode();
  else renderDiffMode();
}

// --- mode switching and split ---------------------------------------------

const SPLIT_KEYS: Record<Mode, string> = {
  viewer: "jsonview:split",
  diff: "jsonview:split-diff",
};
const DEFAULT_RATIOS: Record<Mode, number> = { viewer: 0.3, diff: 0.4 };
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

function applySplit(ratio: number): void {
  inputPaneEl.style.flex = `0 0 ${ratio * 100}%`;
}

function loadSplit(): number {
  const saved = Number(localStorage.getItem(SPLIT_KEYS[mode]));
  return saved > 0 ? saved : DEFAULT_RATIOS[mode];
}

function setSplit(ratio: number): void {
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  applySplit(clamped);
  localStorage.setItem(SPLIT_KEYS[mode], String(clamped));
}

function applyMode(next: Mode): void {
  mode = next;
  localStorage.setItem(MODE_KEY, next);
  document.body.dataset.mode = next;
  viewerEditor.hidden = next !== "viewer";
  diffEditors.hidden = next !== "diff";
  diffBar.hidden = next !== "diff";
  modeViewerBtn.setAttribute("aria-pressed", String(next === "viewer"));
  modeDiffBtn.setAttribute("aria-pressed", String(next === "diff"));
  setActiveSlot(activeSlot);
  applySplit(loadSplit());
  refresh();
}

modeViewerBtn.addEventListener("click", () => applyMode("viewer"));
modeDiffBtn.addEventListener("click", () => applyMode("diff"));

// --- toolbar actions --------------------------------------------------------

function readFile(file: File, pane: InputPane, slot?: Slot): void {
  const reader = new FileReader();
  reader.onload = () => {
    pane.setText(String(reader.result ?? ""));
    if (slot) setName(slot, file.name);
  };
  reader.readAsText(file);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) readFile(file, activePane(), mode === "diff" ? activeSlot : undefined);
  fileInput.value = "";
});

urlBtn.addEventListener("click", async () => {
  const url = window.prompt("URL of a JSON resource:");
  if (!url) return;
  const pane = activePane();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    pane.setText(await res.text());
    if (mode === "diff") setName(activeSlot, url);
  } catch (err) {
    pane.showError(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
  }
});

sampleBtn.addEventListener("click", () => {
  if (mode === "viewer") {
    viewerPane.setText(SAMPLE);
    return;
  }
  paneA.setText(SAMPLE);
  paneB.setText(SAMPLE_B);
  setName("a", "Version A");
  setName("b", "Version B");
});

clearBtn.addEventListener("click", () => {
  if (mode === "viewer") {
    viewerPane.setText("");
    return;
  }
  paneA.setText("");
  paneB.setText("");
  setName("a", "Version A");
  setName("b", "Version B");
});

swapBtn.addEventListener("click", () => {
  const textA = paneA.getText();
  const textB = paneB.getText();
  const nameA = slots.a.name.textContent ?? "Version A";
  const nameB = slots.b.name.textContent ?? "Version B";
  paneA.setText(textB);
  paneB.setText(textA);
  setName("a", nameB);
  setName("b", nameA);
});

searchInput.addEventListener("input", () => {
  filterTree(treeOutput, searchInput.value);
});

expandAllBtn.addEventListener("click", () => setAllExpanded(treeOutput, true));
collapseAllBtn.addEventListener("click", () => setAllExpanded(treeOutput, false));

prevChangeBtn.addEventListener("click", () => goToChange(-1));
nextChangeBtn.addEventListener("click", () => goToChange(1));

function applyOnlyChanges(on: boolean): void {
  onlyChanges.checked = on;
  treeOutput.classList.toggle("only-changes", on);
}

onlyChanges.addEventListener("change", () => {
  applyOnlyChanges(onlyChanges.checked);
  localStorage.setItem(ONLY_CHANGES_KEY, String(onlyChanges.checked));
});
applyOnlyChanges(localStorage.getItem(ONLY_CHANGES_KEY) === "true");

// --- divider ---------------------------------------------------------------

divider.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  divider.classList.add("dragging");
  document.body.style.userSelect = "none";

  const onMove = (ev: PointerEvent) => {
    const rect = mainEl.getBoundingClientRect();
    setSplit((ev.clientX - rect.left) / rect.width);
  };
  const onUp = () => {
    divider.classList.remove("dragging");
    document.body.style.userSelect = "";
    divider.removeEventListener("pointermove", onMove);
    divider.removeEventListener("pointerup", onUp);
  };
  divider.addEventListener("pointermove", onMove);
  divider.addEventListener("pointerup", onUp);
});

divider.addEventListener("dblclick", () => setSplit(DEFAULT_RATIOS[mode]));

// --- theme -----------------------------------------------------------------

const THEME_KEY = "jsonview:theme";
const themeToggleBtn = document.querySelector<HTMLButtonElement>("#theme-toggle-btn")!;

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

const savedTheme = localStorage.getItem(THEME_KEY);
applyTheme(
  savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
);

themeToggleBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

ready = true;
applyMode(mode);
