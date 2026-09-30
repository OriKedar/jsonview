import {
  coordFromString,
  coordFromArray,
  coordFromEntries,
  coordFromPair,
  type Coord,
} from "./geo";

const GEO_KEY_HINT = /lat|lon|lng|geo|location|coord|position|place/i;

export function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function formatPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

const EPOCH_SECONDS_MIN = 1e9; // 2001-09-09
const EPOCH_SECONDS_MAX = 1e10; // 2286-11-20
const EPOCH_MS_MIN = EPOCH_SECONDS_MIN * 1000;
const EPOCH_MS_MAX = EPOCH_SECONDS_MAX * 1000;

function epochToMillis(value: unknown): number | null {
  let num: number;
  if (typeof value === "number" && Number.isInteger(value)) {
    num = value;
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    num = Number(value);
    if (!Number.isSafeInteger(num)) return null;
  } else {
    return null;
  }
  if (num >= EPOCH_MS_MIN && num < EPOCH_MS_MAX) return num;
  if (num >= EPOCH_SECONDS_MIN && num < EPOCH_SECONDS_MAX) return num * 1000;
  return null;
}

const DEFAULT_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getTimezoneList(): string[] {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supportedValuesOf === "function") {
    try {
      return supportedValuesOf("timeZone");
    } catch {
      // fall through to default list
    }
  }
  return DEFAULT_TIMEZONES;
}

function formatInZone(ms: number, tz: string): string {
  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: tz,
  }).format(new Date(ms));
  return `${formatted} (${tz})`;
}

let activePopup: HTMLElement | null = null;
let pickedButtons: HTMLButtonElement[] = [];

function clearPickedHighlight(): void {
  pickedButtons.forEach((b) => b.classList.remove("picked"));
  pickedButtons = [];
}

document.addEventListener("click", () => {
  activePopup?.classList.add("hidden");
  activePopup = null;
  clearPickedHighlight();
});

function makeClockButton(ms: number): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "epoch-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "clock-btn";
  btn.title = "Convert timestamp to date";
  btn.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.6V8.2L10.4 9.8"/></svg>';

  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "date-preview hidden";
  preview.title = "Click to change timezone";
  preview.textContent = formatInZone(ms, tz);

  const popup = document.createElement("div");
  popup.className = "tz-popup hidden";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "tz-copy";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(preview.textContent ?? "").then(() => {
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1000);
    });
  });

  const select = document.createElement("select");
  select.className = "tz-select";
  for (const zone of getTimezoneList()) {
    const opt = document.createElement("option");
    opt.value = zone;
    opt.textContent = zone;
    if (zone === tz) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("click", (e) => e.stopPropagation());
  select.addEventListener("change", () => {
    tz = select.value;
    preview.textContent = formatInZone(ms, tz);
  });

  popup.appendChild(copyBtn);
  popup.appendChild(select);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    preview.classList.toggle("hidden");
    if (preview.classList.contains("hidden")) {
      popup.classList.add("hidden");
      if (activePopup === popup) activePopup = null;
    }
  });

  preview.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activePopup && activePopup !== popup) activePopup.classList.add("hidden");
    popup.classList.toggle("hidden");
    activePopup = popup.classList.contains("hidden") ? null : popup;
  });

  wrap.appendChild(btn);
  wrap.appendChild(preview);
  wrap.appendChild(popup);
  return wrap;
}

function buildGeoPopup(coord: Coord): HTMLDivElement {
  const popup = document.createElement("div");
  popup.className = "geo-popup hidden";
  popup.addEventListener("click", (e) => e.stopPropagation());

  const coordText = `${coord.lat.toFixed(6)}, ${coord.lon.toFixed(6)}`;

  const mapFrame = document.createElement("iframe");
  mapFrame.className = "geo-map";
  mapFrame.title = "Map preview";
  const d = 0.01;
  const bbox = `${coord.lon - d},${coord.lat - d},${coord.lon + d},${coord.lat + d}`;
  mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${coord.lat},${coord.lon}&layer=mapnik`;

  const row = document.createElement("div");
  row.className = "geo-row";

  const label = document.createElement("span");
  label.className = "geo-coord";
  label.textContent = coordText;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "tz-copy";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(coordText).then(() => {
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1000);
    });
  });

  const osmLink = document.createElement("a");
  osmLink.href = `https://www.openstreetmap.org/?mlat=${coord.lat}&mlon=${coord.lon}#map=15/${coord.lat}/${coord.lon}`;
  osmLink.target = "_blank";
  osmLink.rel = "noopener noreferrer";
  osmLink.className = "geo-link";
  osmLink.textContent = "OpenStreetMap ↗";

  const gmapLink = document.createElement("a");
  gmapLink.href = `https://www.google.com/maps?q=${coord.lat},${coord.lon}`;
  gmapLink.target = "_blank";
  gmapLink.rel = "noopener noreferrer";
  gmapLink.className = "geo-link";
  gmapLink.textContent = "Google Maps ↗";

  row.appendChild(label);
  row.appendChild(copyBtn);
  row.appendChild(osmLink);
  row.appendChild(gmapLink);

  popup.appendChild(mapFrame);
  popup.appendChild(row);
  return popup;
}

function togglePopup(popup: HTMLElement): void {
  if (activePopup && activePopup !== popup) activePopup.classList.add("hidden");
  popup.classList.toggle("hidden");
  activePopup = popup.classList.contains("hidden") ? null : popup;
}

function makePinButton(coord: Coord): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "geo-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pin-btn";
  btn.title = "View on map";
  btn.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 15S3 9.5 3 6a5 5 0 0 1 10 0c0 3.5-5 9-5 9Z"/><circle cx="8" cy="6" r="1.7"/></svg>';

  const popup = buildGeoPopup(coord);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePopup(popup);
  });

  wrap.appendChild(btn);
  wrap.appendChild(popup);
  return wrap;
}

let pendingPick: { value: number; btn: HTMLButtonElement } | null = null;

function clearPendingPick(): void {
  pendingPick?.btn.classList.remove("selected");
  pendingPick = null;
}

function makePickButton(value: number): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "geo-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pick-btn";
  btn.title = "Pick as map coordinate (select two numbers)";
  btn.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.5"/><path d="M8 2v3M8 11v3M2 8h3M11 8h3"/></svg>';

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (pendingPick && pendingPick.btn === btn) {
      clearPendingPick();
      return;
    }
    if (pickedButtons.includes(btn)) {
      // re-clicking a button from the currently shown pair cancels it
      activePopup?.classList.add("hidden");
      activePopup = null;
      clearPickedHighlight();
      return;
    }
    if (!pendingPick) {
      clearPickedHighlight();
      pendingPick = { value, btn };
      btn.classList.add("selected");
      return;
    }

    const firstBtn = pendingPick.btn;
    const coord = coordFromPair(pendingPick.value, value);
    clearPendingPick();
    if (!coord) {
      btn.classList.add("invalid-flash");
      setTimeout(() => btn.classList.remove("invalid-flash"), 600);
      return;
    }

    firstBtn.classList.add("picked");
    btn.classList.add("picked");
    pickedButtons = [firstBtn, btn];

    const popup = buildGeoPopup(coord);
    wrap.appendChild(popup);
    togglePopup(popup);
  });

  wrap.appendChild(btn);
  return wrap;
}

export function makeKeySpan(key: string): HTMLSpanElement {
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
    const coord =
      type === "array" ? coordFromArray(value as unknown[]) : coordFromEntries(entries);
    if (coord) summary.appendChild(makePinButton(coord));
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
  const ms = epochToMillis(value);
  if (ms !== null) leaf.appendChild(makeClockButton(ms));
  const coord = type === "string" ? coordFromString(value as string) : null;
  if (coord) leaf.appendChild(makePinButton(coord));
  if (type === "number" && key !== null && GEO_KEY_HINT.test(key)) {
    leaf.appendChild(makePickButton(value as number));
  }
  leaf.appendChild(makeCopyButton(value));
  return leaf;
}

export function renderTree(container: HTMLElement, data: unknown): void {
  clearPendingPick();
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
    let ownText: string;
    if (n.classList.contains("leaf")) {
      const keyText = n.querySelector(":scope > .key")?.textContent ?? "";
      const valText = n.querySelector(":scope > .val")?.textContent ?? "";
      ownText = (keyText + valText).toLowerCase();
    } else {
      ownText = n.querySelector(":scope > summary")?.textContent?.toLowerCase() ?? "";
    }
    n.classList.toggle("match", ownText.includes(q));
  });

  nodes.forEach((n) => {
    const hasMatchDescendant = !!n.querySelector(".match");
    const show = n.classList.contains("match") || hasMatchDescendant;
    n.classList.toggle("hidden", !show);
    if (show && n.tagName === "DETAILS") (n as HTMLDetailsElement).open = true;
  });
}
