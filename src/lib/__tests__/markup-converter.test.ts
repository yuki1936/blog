import { describe, expect, test } from "vitest";
import {
  MAX_DOCUMENT_BYTES,
  createPreviewDocument,
  diagnosticLabel,
  formatExamples,
  formatExtensions,
  formatFromFilename,
  formatMimeTypes,
} from "../markup-converter";

describe("markup converter metadata", () => {
  test("recognizes supported document extensions case-insensitively", () => {
    expect(formatFromFilename("post.MD")).toBe("markdown");
    expect(formatFromFilename("page.htm")).toBe("html");
    expect(formatFromFilename("paper.typst")).toBe("typst");
    expect(formatFromFilename("paper.latex")).toBe("latex");
    expect(formatFromFilename("README")).toBeUndefined();
  });

  test("keeps examples and download metadata complete for every format", () => {
    for (const format of ["markdown", "html", "typst", "latex"] as const) {
      expect(formatExamples[format].length).toBeGreaterThan(20);
      expect(formatExtensions[format]).toBeTruthy();
      expect(formatMimeTypes[format]).toContain("charset=utf-8");
    }
    expect(MAX_DOCUMENT_BYTES).toBe(5 * 1024 * 1024);
  });

  test("maps known diagnostics and preserves unknown messages", () => {
    expect(diagnosticLabel("details_degraded", "fallback")).toContain("可折叠内容");
    expect(diagnosticLabel("unknown", "原始诊断")).toBe("原始诊断");
  });
});

describe("markup preview document", () => {
  test("wraps converted HTML in a network-isolated preview document", () => {
    const document = createPreviewDocument("<h1>Hello</h1>");

    expect(document).toContain("<!doctype html>");
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("img-src data: blob:");
    expect(document).toContain("<body><h1>Hello</h1></body>");
  });
});
