import { describe, expect, it } from "vitest";
import { editJson, jsonAtPath } from "../json-editor";

describe("JSON node editing", () => {
  it("preserves arbitrary own keys without changing object prototypes", () => {
    const original = JSON.parse('{"__proto__":{"nested":1},"constructor":2}');
    const edited = editJson(original, ["__proto__", "nested"], "edit", 3);
    expect(jsonAtPath(edited, ["__proto__", "nested"])).toBe(3);
    expect(original.__proto__.nested).toBe(1);
    const added = editJson({}, [], "add", undefined, "__proto__");
    expect(JSON.stringify(added)).toBe('{"__proto__":null}');
    expect(Object.getPrototypeOf(added)).toBe(Object.prototype);
  });

  it("edits primitives and removes array elements without sparse slots", () => {
    expect(editJson(null, [], "edit", false)).toBe(false);
    const original = { items: [1, 2, 3] };
    expect(editJson(original, ["items", 1], "delete")).toEqual({
      items: [1, 3],
    });
    expect(original.items).toEqual([1, 2, 3]);
    expect(editJson(original, ["items"], "add")).toEqual({
      items: [1, 2, 3, null],
    });
  });
});
