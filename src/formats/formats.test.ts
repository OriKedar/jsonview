import { describe, expect, it } from "vitest";
import { parseInput } from "./index";
import { formatJavaMap, parseJavaMap } from "./javaMap";

const SPEC =
  "{internal_shift_id=Flex 4, start_shift_ts=1.7933346E9, driver_id=30034, driver_name=Harleigh Jones, is_hidden_from_viacal=false, shift_breaks=null, start_shift_location={lat=-37.79245406, lng=175.2930126, address=null, description=401 Grey St, Hamilton East}}";

describe("parseJavaMap", () => {
  it("parses the spec example", () => {
    expect(parseJavaMap(SPEC)).toEqual({
      ok: true,
      value: {
        internal_shift_id: "Flex 4",
        start_shift_ts: 1793334600,
        driver_id: 30034,
        driver_name: "Harleigh Jones",
        is_hidden_from_viacal: false,
        shift_breaks: null,
        start_shift_location: {
          lat: -37.79245406,
          lng: 175.2930126,
          address: null,
          description: "401 Grey St, Hamilton East",
        },
      },
    });
  });

  it("parses lists, empties and keeps risky numbers as strings", () => {
    const r = parseJavaMap("{a=[1, 2], b=[{x=1}, {x=2}], c={}, d=[], e=007, f=0.5, g=12345678901234567890}");
    expect(r).toEqual({
      ok: true,
      value: { a: [1, 2], b: [{ x: 1 }, { x: 2 }], c: {}, d: [], e: "007", f: 0.5, g: "12345678901234567890" },
    });
  });

  it("reports unclosed braces with a position", () => {
    const r = parseJavaMap("{a=1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.index).toBeDefined();
  });

  it("round-trips through the pretty layout", () => {
    const first = parseJavaMap(SPEC);
    if (!first.ok) throw new Error("parse failed");
    const pretty = formatJavaMap(first.value);
    expect(pretty).toContain("\n  ");
    expect(parseJavaMap(pretty)).toEqual(first);
  });
});

describe("parseInput", () => {
  it("prefers JSON", () => {
    expect(parseInput('{"a":1}')).toMatchObject({ ok: true, format: "json", value: { a: 1 } });
  });
  it("falls back to Java Map", () => {
    expect(parseInput("{a=1}")).toMatchObject({ ok: true, format: "javaMap", value: { a: 1 } });
  });
  it("keeps the JSON error for plain junk", () => {
    expect(parseInput("hello")).toMatchObject({ ok: false, format: "json" });
  });
  it("shows a Java error for a broken Java dump", () => {
    expect(parseInput("{a=1")).toMatchObject({ ok: false, format: "javaMap" });
  });
});
