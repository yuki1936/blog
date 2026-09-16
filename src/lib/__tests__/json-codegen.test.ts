import { describe, expect, test } from "vitest";
import { generateGo, generateRust, inferJsonSchema } from "../json-codegen";

describe("inferJsonSchema", () => {
  test("merges array object fields and marks missing or null values optional", () => {
    const schema = inferJsonSchema([
      { id: 1, label: "one" },
      { id: 2, label: null },
      { id: 3 },
    ]);

    expect(schema.kind).toBe("array");
    expect(schema.item).toMatchObject({ kind: "object", name: "RootItem" });
    expect(schema.item?.fields).toEqual([
      { key: "id", schema: { kind: "integer", optional: false } },
      { key: "label", schema: { kind: "string", optional: true } },
    ]);
  });

  test("uses any for mixed values", () => {
    const schema = inferJsonSchema([1, "two", true]);
    expect(schema.item).toEqual({ kind: "any", optional: false });
  });
});

describe("Rust generation", () => {
  test("keeps normalized field and nested type names unique", () => {
    const output = generateRust({
      "foo-bar": { a: 1 },
      foo_bar: { b: "x" },
      type: true,
    });

    expect(output).toContain("pub foo_bar: RootFooBar,");
    expect(output).toContain("pub foo_bar_2: RootFooBar2,");
    expect(output).toContain("pub type_field: bool,");
    expect(output).toContain("#[serde(rename = \"type\")]");
  });

  test("escapes arbitrary JSON keys in serde rename literals", () => {
    const output = generateRust({
      'quote"slash\\line\ncontrol\u0000': 1,
    });

    expect(output).toContain(
      '#[serde(rename = "quote\\"slash\\\\line\\ncontrol\\u{0}")]',
    );
  });
});

describe("Go generation", () => {
  test("keeps normalized field names unique and escapes backticks in tags", () => {
    const output = generateGo({
      "foo-bar": { a: 1 },
      foo_bar: { b: "x" },
      "a`b": true,
    });

    expect(output).toContain("FooBar RootFooBar");
    expect(output).toContain("FooBar2 RootFooBar2");
    expect(output).toContain('"json:\\"a`b\\""');
  });

  test("uses pointers and omitempty for optional fields", () => {
    const output = generateGo([{ id: 1, label: "one" }, { id: 2 }]);
    expect(output).toContain("Label *string `json:\"label,omitempty\"`");
  });
});
