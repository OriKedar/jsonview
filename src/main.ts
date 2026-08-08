import "./style.css";
import { parseJson, repairJson } from "./parser";
import { renderTree, setAllExpanded, filterTree } from "./tree";

const input = document.querySelector<HTMLTextAreaElement>("#json-input")!;
const highlightLayer = document.querySelector<HTMLDivElement>("#highlight-layer")!;
const errorBanner = document.querySelector<HTMLDivElement>("#error-banner")!;
const errorMessage = document.querySelector<HTMLButtonElement>("#error-message")!;
const fixBtn = document.querySelector<HTMLButtonElement>("#fix-btn")!;
let errorIndex: number | undefined;
let highlightTimer: number | undefined;
const treeOutput = document.querySelector<HTMLDivElement>("#tree-output")!;
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const urlBtn = document.querySelector<HTMLButtonElement>("#url-btn")!;
const sampleBtn = document.querySelector<HTMLButtonElement>("#sample-btn")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear-btn")!;
const searchInput = document.querySelector<HTMLInputElement>("#search-input")!;
const expandAllBtn = document.querySelector<HTMLButtonElement>("#expand-all-btn")!;
const collapseAllBtn = document.querySelector<HTMLButtonElement>("#collapse-all-btn")!;

const STORAGE_KEY = "jsonview:last-input";
const SAMPLE = JSON.stringify(
  {
    name: "jsonview",
    version: 1,
    active: true,
    tags: ["json", "viewer", "static"],
    meta: { author: "you", stars: null },
  },
  null,
  2,
);

function setControlsEnabled(enabled: boolean): void {
  expandAllBtn.disabled = !enabled;
  collapseAllBtn.disabled = !enabled;
  searchInput.disabled = !enabled;
}

function highlightError(): void {
  if (errorIndex === undefined) return;
  const end = Math.min(errorIndex + 1, input.value.length);
  input.focus();
  input.setSelectionRange(errorIndex, Math.max(end, errorIndex));
}

function updateHighlightLayer(): void {
  const text = input.value;
  if (errorIndex === undefined || errorIndex > text.length) {
    highlightLayer.replaceChildren(document.createTextNode(text));
    return;
  }
  const before = text.slice(0, errorIndex);
  const marked = text.slice(errorIndex, errorIndex + 1) || " ";
  const after = text.slice(errorIndex + 1);
  const mark = document.createElement("mark");
  mark.className = "error-mark";
  mark.textContent = marked;
  highlightLayer.replaceChildren(document.createTextNode(before), mark, document.createTextNode(after));
}

input.addEventListener("scroll", () => {
  highlightLayer.scrollTop = input.scrollTop;
  highlightLayer.scrollLeft = input.scrollLeft;
});

function showError(message: string, line?: number, column?: number, index?: number): void {
  errorBanner.hidden = false;
  errorIndex = index;
  const hasLocation = /line \d+/i.test(message);
  errorMessage.textContent =
    line !== undefined && !hasLocation
      ? `${message} (line ${line}, column ${column})`
      : message;
  errorMessage.disabled = index === undefined;
  const repaired = repairJson(input.value);
  fixBtn.hidden = repaired === null || repaired === input.value;
  treeOutput.replaceChildren();
  setControlsEnabled(false);

  updateHighlightLayer();

  clearTimeout(highlightTimer);
  if (index !== undefined) {
    highlightTimer = window.setTimeout(() => {
      if (errorIndex === index) highlightError();
    }, 500);
  }
}

function process(text: string): void {
  const result = parseJson(text);
  if (!result.ok) {
    if (text.trim() !== "") {
      showError(result.message, result.line, result.column, result.index);
    } else {
      errorBanner.hidden = true;
      fixBtn.hidden = true;
      errorIndex = undefined;
      updateHighlightLayer();
      treeOutput.replaceChildren();
      setControlsEnabled(false);
    }
    return;
  }
  errorBanner.hidden = true;
  errorIndex = undefined;
  updateHighlightLayer();
  renderTree(treeOutput, result.value);
  setControlsEnabled(true);
  searchInput.value = "";
}

function loadText(text: string): void {
  input.value = text;
  localStorage.setItem(STORAGE_KEY, text);
  process(text);
}

function readFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => loadText(String(reader.result ?? ""));
  reader.readAsText(file);
}

input.addEventListener("input", () => {
  localStorage.setItem(STORAGE_KEY, input.value);
  process(input.value);
});

input.addEventListener("dragover", (e) => {
  e.preventDefault();
  input.classList.add("drag-over");
});
input.addEventListener("dragleave", () => input.classList.remove("drag-over"));
input.addEventListener("drop", (e) => {
  e.preventDefault();
  input.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) readFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) readFile(file);
  fileInput.value = "";
});

urlBtn.addEventListener("click", async () => {
  const url = window.prompt("URL of a JSON resource:");
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    loadText(await res.text());
  } catch (err) {
    showError(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
  }
});

sampleBtn.addEventListener("click", () => loadText(SAMPLE));

clearBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  loadText("");
});

searchInput.addEventListener("input", () => {
  filterTree(treeOutput, searchInput.value);
});

errorMessage.addEventListener("click", highlightError);

fixBtn.addEventListener("click", () => {
  const repaired = repairJson(input.value);
  if (repaired === null) return;
  const pretty = JSON.stringify(JSON.parse(repaired), null, 2);
  loadText(pretty);
});

expandAllBtn.addEventListener("click", () => setAllExpanded(treeOutput, true));
collapseAllBtn.addEventListener("click", () => setAllExpanded(treeOutput, false));

const saved = localStorage.getItem(STORAGE_KEY);
loadText(saved ?? SAMPLE);
