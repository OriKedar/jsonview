import { describe, expect, it } from "vitest";
import { stepIndex } from "./search";

describe("stepIndex", () => {
  it("returns -1 when no matches", () => {
    expect(stepIndex(-1, 0, 1)).toBe(-1);
    expect(stepIndex(2, 0, -1)).toBe(-1);
  });
  it("starts at first going forward, last going back", () => {
    expect(stepIndex(-1, 5, 1)).toBe(0);
    expect(stepIndex(-1, 5, -1)).toBe(4);
  });
  it("wraps at both ends", () => {
    expect(stepIndex(4, 5, 1)).toBe(0);
    expect(stepIndex(0, 5, -1)).toBe(4);
  });
  it("steps normally in the middle", () => {
    expect(stepIndex(2, 5, 1)).toBe(3);
    expect(stepIndex(2, 5, -1)).toBe(1);
  });
});
