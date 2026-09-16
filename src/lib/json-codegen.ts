export type SchemaKind =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "array"
  | "object"
  | "any";

export interface FieldSchema {
  key: string;
  schema: JsonSchema;
}

export interface JsonSchema {
  kind: SchemaKind;
  optional: boolean;
  name?: string;
  fields?: FieldSchema[];
  item?: JsonSchema;
}

const rustReserved = new Set([
  "as", "break", "const", "continue", "crate", "else", "enum", "extern",
  "false", "fn", "for", "if", "impl", "in", "let", "loop", "match",
  "mod", "move", "mut", "pub", "ref", "return", "self", "Self",
  "static", "struct", "super", "trait", "true", "type", "unsafe", "use",
  "where", "while", "async", "await", "dyn", "abstract", "become", "box",
  "do", "final", "macro", "override", "priv", "typeof", "unsized",
  "virtual", "yield", "try",
]);

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function toPascalCase(value: string): string {
  const result = splitWords(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("") || "Value";
  return /^\d/.test(result) ? `Value${result}` : result;
}

function toSnakeCase(value: string): string {
  const result = splitWords(value).map((word) => word.toLowerCase()).join("_") || "value";
  const safe = /^\d/.test(result) ? `field_${result}` : result;
  return rustReserved.has(safe) ? `${safe}_field` : safe;
}

function reserveUnique(
  candidate: string,
  used: Set<string>,
  separator = "",
): string {
  let result = candidate;
  let suffix = 2;
  while (used.has(result)) {
    result = `${candidate}${separator}${suffix}`;
    suffix += 1;
  }
  used.add(result);
  return result;
}

function rustStringLiteral(value: string): string {
  let result = '"';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (character === "\\") result += "\\\\";
    else if (character === '"') result += '\\"';
    else if (character === "\n") result += "\\n";
    else if (character === "\r") result += "\\r";
    else if (character === "\t") result += "\\t";
    else if (codePoint < 0x20 || codePoint === 0x7f) {
      result += `\\u{${codePoint.toString(16)}}`;
    } else result += character;
  }
  return `${result}"`;
}

function goStructTag(key: string, omitEmpty: boolean): string {
  const tag = `json:${JSON.stringify(`${key}${omitEmpty ? ",omitempty" : ""}`)}`;
  return tag.includes("`") ? JSON.stringify(tag) : `\`${tag}\``;
}

function inferValues(values: unknown[], name: string): JsonSchema {
  const hasNull = values.some((value) => value === null);
  const nonNull = values.filter((value) => value !== null);

  if (nonNull.length === 0) return { kind: "any", optional: true };

  const isArray = nonNull.map(Array.isArray);
  if (isArray.every(Boolean)) {
    const items = (nonNull as unknown[][]).flat();
    return {
      kind: "array",
      optional: hasNull,
      item: items.length > 0
        ? inferValues(items, `${name}Item`)
        : { kind: "any", optional: false },
    };
  }

  const types = new Set(nonNull.map((value) => typeof value));
  if (types.size !== 1 || isArray.some(Boolean)) {
    return { kind: "any", optional: hasNull };
  }

  const type = types.values().next().value;
  if (type === "string") return { kind: "string", optional: hasNull };
  if (type === "boolean") return { kind: "boolean", optional: hasNull };
  if (type === "number") {
    return {
      kind: nonNull.every((value) => Number.isInteger(value)) ? "integer" : "float",
      optional: hasNull,
    };
  }

  if (type === "object") {
    const objects = nonNull as Record<string, unknown>[];
    const keys = [...new Set(objects.flatMap((object) => Object.keys(object)))];
    const fields = keys.map((key) => {
      const presentValues = objects
        .filter((object) => Object.prototype.hasOwnProperty.call(object, key))
        .map((object) => object[key]);
      const schema = inferValues(presentValues, `${name}${toPascalCase(key)}`);
      if (presentValues.length < objects.length) schema.optional = true;
      return { key, schema };
    });
    return { kind: "object", optional: hasNull, name, fields };
  }

  return { kind: "any", optional: hasNull };
}

export function inferJsonSchema(value: unknown): JsonSchema {
  const schema = inferValues([value], "Root");
  const usedNames = new Set<string>();

  function assignUniqueObjectNames(current: JsonSchema): void {
    if (current.kind === "object") {
      current.name = reserveUnique(current.name ?? "Value", usedNames);
      for (const field of current.fields ?? []) assignUniqueObjectNames(field.schema);
    } else if (current.kind === "array" && current.item) {
      assignUniqueObjectNames(current.item);
    }
  }

  assignUniqueObjectNames(schema);
  return schema;
}

function collectObjects(schema: JsonSchema, result: JsonSchema[] = []): JsonSchema[] {
  if (schema.kind === "object") {
    if (!result.some((item) => item.name === schema.name)) result.push(schema);
    for (const field of schema.fields ?? []) collectObjects(field.schema, result);
  } else if (schema.kind === "array" && schema.item) {
    collectObjects(schema.item, result);
  }
  return result;
}

function rustBaseType(schema: JsonSchema): string {
  switch (schema.kind) {
    case "string": return "String";
    case "integer": return "i64";
    case "float": return "f64";
    case "boolean": return "bool";
    case "array": return `Vec<${rustType(schema.item ?? { kind: "any", optional: false })}>`;
    case "object": return schema.name ?? "serde_json::Value";
    default: return "serde_json::Value";
  }
}

function rustType(schema: JsonSchema): string {
  const base = rustBaseType({ ...schema, optional: false });
  return schema.optional ? `Option<${base}>` : base;
}

function renderRustStruct(schema: JsonSchema): string {
  const usedNames = new Set<string>();
  const fields = (schema.fields ?? []).flatMap(({ key, schema: field }) => {
    const identifier = reserveUnique(toSnakeCase(key), usedNames, "_");
    const attributes = identifier === key
      ? []
      : [`    #[serde(rename = ${rustStringLiteral(key)})]`];
    return [...attributes, `    pub ${identifier}: ${rustType(field)},`];
  });
  return [
    "#[derive(Debug, Clone, Serialize, Deserialize)]",
    `pub struct ${schema.name} {`,
    ...fields,
    "}",
  ].join("\n");
}

export function generateRust(value: unknown): string {
  const schema = inferJsonSchema(value);
  const objects = collectObjects(schema);
  const blocks = objects.map(renderRustStruct);
  if (schema.kind !== "object") {
    blocks.unshift(`pub type Root = ${rustType(schema)};`);
  }
  return ["use serde::{Deserialize, Serialize};", "", ...blocks].join("\n\n");
}

function goBaseType(schema: JsonSchema): string {
  switch (schema.kind) {
    case "string": return "string";
    case "integer": return "int64";
    case "float": return "float64";
    case "boolean": return "bool";
    case "array": return `[]${goType(schema.item ?? { kind: "any", optional: false })}`;
    case "object": return schema.name ?? "any";
    default: return "any";
  }
}

function goType(schema: JsonSchema): string {
  const base = goBaseType({ ...schema, optional: false });
  return schema.optional && base !== "any" ? `*${base}` : base;
}

function renderGoStruct(schema: JsonSchema): string {
  const usedNames = new Set<string>();
  const fields = (schema.fields ?? []).map(({ key, schema: field }) => {
    const fieldName = reserveUnique(toPascalCase(key), usedNames);
    const tag = ` ${goStructTag(key, field.optional)}`;
    return `    ${fieldName} ${goType(field)}${tag}`;
  });
  return [`type ${schema.name} struct {`, ...fields, "}"].join("\n");
}

export function generateGo(value: unknown): string {
  const schema = inferJsonSchema(value);
  const objects = collectObjects(schema);
  const blocks = objects.map(renderGoStruct);
  if (schema.kind !== "object") blocks.unshift(`type Root ${goType(schema)}`);
  return blocks.join("\n\n");
}
