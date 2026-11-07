import { parseJson, type ParseResult } from "../parser";
import { looksLikeJavaMap, parseJavaMap } from "./javaMap";

export type FormatId = "auto" | "json" | "javaMap";
export type DetectedFormat = "json" | "javaMap";

export const FORMAT_OPTIONS: { id: FormatId; label: string }[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "json", label: "JSON" },
  { id: "javaMap", label: "Java Map" },
];

export type FormatParseResult = ParseResult & { format: DetectedFormat };

export function parseInput(text: string, format: FormatId = "auto"): FormatParseResult {
  if (format === "json") {
    return { ...parseJson(text), format: "json" };
  }
  if (format === "javaMap") {
    return { ...parseJavaMap(text), format: "javaMap" };
  }

  const jsonResult = parseJson(text);
  if (jsonResult.ok) {
    return { ...jsonResult, format: "json" };
  }
  if (looksLikeJavaMap(text)) {
    const jm = parseJavaMap(text);
    if (jm.ok) {
      return { ...jm, format: "javaMap" };
    }
    // Unquoted keys: this was meant as a Java map, so show its error, not JSON's.
    if (!/^\s*[{[]\s*"/.test(text)) {
      return { ...jm, format: "javaMap" };
    }
  }
  return { ...jsonResult, format: "json" };
}
