import { parseJson, repairJson } from "./parser";

export type PaneState =
  | { kind: "empty" }
  | { kind: "valid"; value: unknown }
  | { kind: "invalid" };

export interface InputPaneOptions {
  storageKey: string;
  placeholder: string;
  initialText: string;
  /** Fires after every text change, including Auto-fix, drops and errors shown via showError(). */
  onChange: () => void;
  onFocus?: () => void;
  /** Fires when a file is dropped on the editor, after its text is loaded. */
  onFile?: (file: File) => void;
}

export interface InputPane {
  readonly state: PaneState;
  getText(): string;
  /** Replaces the text, persists it and notifies onChange. */
  setText(text: string): void;
  /** Shows a message that does not come from parsing (e.g. a failed URL fetch). */
  showError(message: string): void;
}

const MARKUP = `
  <div class="error-banner" hidden>
    <button class="error-message error-link" type="button"></button>
    <button class="btn fix-btn" type="button">Auto-fix JSON</button>
  </div>
  <div class="textarea-wrap">
    <div class="highlight-layer" aria-hidden="true"></div>
    <textarea class="json-input" spellcheck="false"></textarea>
  </div>
`;

export function createInputPane(parent: HTMLElement, options: InputPaneOptions): InputPane {
  const root = document.createElement("div");
  root.className = "input-pane";
  root.innerHTML = MARKUP;
  parent.appendChild(root);

  const banner = root.querySelector<HTMLDivElement>(".error-banner")!;
  const message = root.querySelector<HTMLButtonElement>(".error-message")!;
  const fixBtn = root.querySelector<HTMLButtonElement>(".fix-btn")!;
  const highlightLayer = root.querySelector<HTMLDivElement>(".highlight-layer")!;
  const input = root.querySelector<HTMLTextAreaElement>(".json-input")!;
  input.placeholder = options.placeholder;

  let state: PaneState = { kind: "empty" };
  let errorIndex: number | undefined;
  let highlightTimer: number | undefined;

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
    highlightLayer.replaceChildren(
      document.createTextNode(before),
      mark,
      document.createTextNode(after),
    );
  }

  function showBanner(text: string, line?: number, column?: number, index?: number): void {
    banner.hidden = false;
    errorIndex = index;
    const hasLocation = /line \d+/i.test(text);
    message.textContent =
      line !== undefined && !hasLocation ? `${text} (line ${line}, column ${column})` : text;
    message.disabled = index === undefined;
    const repaired = repairJson(input.value);
    fixBtn.hidden = repaired === null || repaired === input.value;
    state = { kind: "invalid" };

    updateHighlightLayer();

    clearTimeout(highlightTimer);
    if (index !== undefined) {
      highlightTimer = window.setTimeout(() => {
        if (errorIndex === index) highlightError();
      }, 500);
    }
  }

  function process(): void {
    const text = input.value;
    const result = parseJson(text);
    if (!result.ok) {
      if (text.trim() !== "") {
        showBanner(result.message, result.line, result.column, result.index);
        return;
      }
      banner.hidden = true;
      fixBtn.hidden = true;
      errorIndex = undefined;
      state = { kind: "empty" };
    } else {
      banner.hidden = true;
      errorIndex = undefined;
      state = { kind: "valid", value: result.value };
    }
    updateHighlightLayer();
  }

  function store(text: string): void {
    localStorage.setItem(options.storageKey, text);
  }

  function setText(text: string): void {
    input.value = text;
    store(text);
    process();
    options.onChange();
  }

  input.addEventListener("scroll", () => {
    highlightLayer.scrollTop = input.scrollTop;
    highlightLayer.scrollLeft = input.scrollLeft;
  });

  input.addEventListener("input", () => {
    store(input.value);
    process();
    options.onChange();
  });

  input.addEventListener("focus", () => options.onFocus?.());

  input.addEventListener("dragover", (e) => {
    e.preventDefault();
    input.classList.add("drag-over");
  });
  input.addEventListener("dragleave", () => input.classList.remove("drag-over"));
  input.addEventListener("drop", (e) => {
    e.preventDefault();
    input.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    options.onFocus?.();
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      options.onFile?.(file);
    };
    reader.readAsText(file);
  });

  message.addEventListener("click", highlightError);

  fixBtn.addEventListener("click", () => {
    const repaired = repairJson(input.value);
    if (repaired === null) return;
    setText(JSON.stringify(JSON.parse(repaired), null, 2));
  });

  input.value = options.initialText;
  store(options.initialText);
  process();

  return {
    get state() {
      return state;
    },
    getText: () => input.value,
    setText,
    showError(text) {
      showBanner(text);
      options.onChange();
    },
  };
}
