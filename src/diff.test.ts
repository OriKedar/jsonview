import { describe, expect, it } from "vitest";
import { diff, listChanges, summarize, type DiffNode } from "./diff";

function find(root: DiffNode, path: string): DiffNode {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.path === path) return node;
    stack.push(...(node.children ?? []));
  }
  throw new Error(`no node at ${path}`);
}

describe("diff", () => {
  it("reports identical values as same", () => {
    const value = { a: 1, b: [1, { c: "x" }], d: null };
    const root = diff(value, structuredClone(value));
    expect(root.status).toBe("same");
    expect(root.changeCount).toBe(0);
    expect(summarize(root)).toEqual({ added: 0, removed: 0, changed: 0, total: 0 });
  });

  it("ignores object key order", () => {
    const root = diff({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 });
    expect(root.status).toBe("same");
  });

  it("detects a changed primitive", () => {
    const root = diff({ version: 1 }, { version: 2 });
    const node = find(root, "$.version");
    expect(node).toMatchObject({ status: "changed", a: 1, b: 2, typeChanged: false });
    expect(root.status).toBe("changed");
    expect(root.changeCount).toBe(1);
  });

  it("flags a type change", () => {
    const node = find(diff({ stars: null }, { stars: 42 }), "$.stars");
    expect(node).toMatchObject({ status: "changed", typeChanged: true, a: null, b: 42 });
  });

  it("distinguishes 1 from \"1\" and true from 1", () => {
    expect(find(diff({ v: 1 }, { v: "1" }), "$.v").typeChanged).toBe(true);
    expect(find(diff({ v: true }, { v: 1 }), "$.v").typeChanged).toBe(true);
  });

  it("detects added and removed keys", () => {
    const root = diff({ keep: 1, gone: 2 }, { keep: 1, fresh: 3 });
    expect(find(root, "$.gone")).toMatchObject({ status: "removed", a: 2 });
    expect(find(root, "$.gone").b).toBeUndefined();
    expect(find(root, "$.fresh")).toMatchObject({ status: "added", b: 3 });
    expect(find(root, "$.fresh").a).toBeUndefined();
    expect(find(root, "$.keep").status).toBe("same");
    expect(summarize(root)).toEqual({ added: 1, removed: 1, changed: 0, total: 2 });
  });

  it("lists A's keys first, then keys only in B", () => {
    const root = diff({ b: 1, a: 1 }, { c: 1, a: 1, b: 1 });
    expect(root.children!.map((c) => c.key)).toEqual(["b", "a", "c"]);
  });

  it("compares arrays by index", () => {
    const root = diff(["json", "viewer", "static"], ["json", "viewer", "diff"]);
    expect(find(root, "$[2]")).toMatchObject({ status: "changed", a: "static", b: "diff" });
    expect(find(root, "$[0]").status).toBe("same");
  });

  it("reports appended and dropped array items", () => {
    const longer = diff([1], [1, 2, 3]);
    expect(find(longer, "$[1]").status).toBe("added");
    expect(find(longer, "$[2]").status).toBe("added");
    const shorter = diff([1, 2, 3], [1]);
    expect(find(shorter, "$[2]").status).toBe("removed");
    expect(summarize(shorter).removed).toBe(2);
  });

  it("treats object vs array as one whole-value change", () => {
    const node = find(diff({ v: { a: 1 } }, { v: [1] }), "$.v");
    expect(node).toMatchObject({ status: "changed", typeChanged: true });
    expect(node.children).toBeUndefined();
    expect(node.changeCount).toBe(1);
  });

  it("treats container vs primitive as one whole-value change", () => {
    const node = find(diff({ v: { a: 1, b: 2 } }, { v: "x" }), "$.v");
    expect(node).toMatchObject({ status: "changed", typeChanged: true });
    expect(node.children).toBeUndefined();
  });

  it("counts an added subtree once and marks its descendants added", () => {
    const root = diff({}, { meta: { a: 1, list: [1, 2] } });
    const meta = find(root, "$.meta");
    expect(meta.status).toBe("added");
    expect(meta.changeCount).toBe(1);
    expect(find(root, "$.meta.list[1]")).toMatchObject({ status: "added", b: 2, changeCount: 0 });
    expect(summarize(root)).toEqual({ added: 1, removed: 0, changed: 0, total: 1 });
  });

  it("counts a removed subtree once", () => {
    const root = diff({ meta: { a: 1, b: { c: 2 } } }, {});
    expect(find(root, "$.meta.b.c").status).toBe("removed");
    expect(summarize(root)).toEqual({ added: 0, removed: 1, changed: 0, total: 1 });
  });

  it("sums changeCount up the tree", () => {
    const root = diff(
      { a: { x: 1, y: 1 }, b: [1, 2] },
      { a: { x: 2, y: 2 }, b: [1, 3] },
    );
    expect(find(root, "$.a").changeCount).toBe(2);
    expect(find(root, "$.b").changeCount).toBe(1);
    expect(root.changeCount).toBe(3);
  });

  it("builds JSONPath-style paths", () => {
    const root = diff(
      { "a b": [{ "c-d": 1, ok_1: 2 }] },
      { "a b": [{ "c-d": 2, ok_1: 2 }] },
    );
    expect(find(root, '$["a b"][0]["c-d"]').status).toBe("changed");
    expect(find(root, '$["a b"][0].ok_1').status).toBe("same");
  });

  it("diffs primitive roots", () => {
    expect(diff(1, 1).status).toBe("same");
    const root = diff(1, "1");
    expect(root).toMatchObject({ path: "$", status: "changed", typeChanged: true });
    expect(summarize(root).changed).toBe(1);
  });

  it("diffs empty containers", () => {
    expect(diff({}, {}).status).toBe("same");
    expect(diff([], []).status).toBe("same");
    expect(diff({}, []).status).toBe("changed");
  });

  it("handles a __proto__ key as plain data", () => {
    const a = JSON.parse('{"__proto__": 1}');
    const b = JSON.parse('{"__proto__": 2}');
    const root = diff(a, b);
    expect(root.children).toHaveLength(1);
    expect(root.children![0]).toMatchObject({ status: "changed", a: 1, b: 2 });
  });
});

describe("listChanges", () => {
  it("returns changes in document order, descending only into changed containers", () => {
    const root = diff(
      { a: 1, tags: ["x", "y"], meta: { old: true } },
      { a: 2, tags: ["x", "z", "w"], meta: {}, extra: 1 },
    );
    expect(listChanges(root).map((n) => `${n.status}:${n.path}`)).toEqual([
      "changed:$.a",
      "changed:$.tags[1]",
      "added:$.tags[2]",
      "removed:$.meta.old",
      "added:$.extra",
    ]);
  });

  it("is empty when nothing differs", () => {
    expect(listChanges(diff({ a: [1] }, { a: [1] }))).toEqual([]);
  });
});
