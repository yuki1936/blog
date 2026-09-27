export type JsonPath = (string | number)[];

export function jsonAtPath(value: unknown, path: JsonPath): unknown {
  return path.reduce<unknown>(
    (current, key) => (current as Record<string | number, unknown>)[key],
    value,
  );
}

export function editJson(
  value: unknown,
  path: JsonPath,
  action: "edit" | "add" | "delete",
  next?: unknown,
  property?: string,
): unknown {
  if (action === "edit" && path.length === 0) return next;
  const result = structuredClone(value);
  const current = jsonAtPath(result, path);
  if (action === "add") {
    if (Array.isArray(current)) current.push(null);
    else if (current && typeof current === "object" && property !== undefined) {
      // JSON keys such as __proto__ must remain ordinary own properties.
      Object.defineProperty(current, property, {
        value: null,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  } else if (path.length) {
    const parent = jsonAtPath(result, path.slice(0, -1)) as Record<
      string | number,
      unknown
    >;
    const key = path.at(-1)!;
    if (action === "delete") {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else
      Object.defineProperty(parent, key, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return result;
}

export function jsonContainerPaths(
  value: unknown,
  path: JsonPath = [],
): string[] {
  if (!value || typeof value !== "object") return [];
  return [
    JSON.stringify(path),
    ...Object.keys(value).flatMap((key) =>
      jsonContainerPaths((value as Record<string, unknown>)[key], [
        ...path,
        Array.isArray(value) ? Number(key) : key,
      ]),
    ),
  ];
}
