import { jsonrepair } from "jsonrepair";

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string; line?: number; column?: number; index?: number };

export function parseJson(text: string): ParseResult {
  if (text.trim() === "") {
    return { ok: false, message: "Empty input." };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const pos = extractPosition(message, text);
    return { ok: false, message, ...pos };
  }
}

export function repairJson(text: string): string | null {
  try {
    const repaired = jsonrepair(text);
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

function extractPosition(
  message: string,
  text: string,
): { line?: number; column?: number; index?: number } {
  const match = message.match(/position (\d+)/);
  if (!match) return {};
  const index = Number(match[1]);
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
  return { line, column, index };
}
