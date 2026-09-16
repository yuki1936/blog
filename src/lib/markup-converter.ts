export type FormatName = "markdown" | "html" | "typst" | "latex";

export interface ConversionOptions {
  mode: "strict" | "compatible";
  full_html_document: boolean;
  document_title?: string;
  link_prefix?: string;
  image_prefix?: string;
}

export interface ConversionDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  line?: number;
  column?: number;
}

export type MarkweftWorkerRequest =
  | { type: "init" }
  | {
      type: "convert";
      id: number;
      source: string;
      from: FormatName | "auto";
      to: FormatName;
      options: ConversionOptions;
    };

export type MarkweftWorkerResponse =
  | { type: "ready" }
  | {
      type: "result";
      id: number;
      output: string;
      previewHtml: string;
      astJson: string;
      diagnostics: ConversionDiagnostic[];
      detectedFormat: FormatName;
      confidence: number;
    }
  | { type: "error"; id?: number; message: string };

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const CONVERSION_TIMEOUT_MS = 10_000;

export const formatLabels: Record<FormatName, string> = {
  markdown: "Markdown",
  html: "HTML",
  typst: "Typst",
  latex: "LaTeX",
};

export const formatExtensions: Record<FormatName, string> = {
  markdown: "md",
  html: "html",
  typst: "typ",
  latex: "tex",
};

export const formatMimeTypes: Record<FormatName, string> = {
  markdown: "text/markdown;charset=utf-8",
  html: "text/html;charset=utf-8",
  typst: "text/plain;charset=utf-8",
  latex: "application/x-tex;charset=utf-8",
};

const extensionFormats: Record<string, FormatName> = {
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  typ: "typst",
  typst: "typst",
  tex: "latex",
  latex: "latex",
};

export const formatExamples: Record<FormatName, string> = {
  markdown: `---
title: Example
language: zh
---

# Hello

> [!NOTE] Note
> Markdown with **strong**, <u>underline</u>, and a footnote.[^note]

| Name | Value |
| --- | ---: |
| Rust | 1 |

[^note]: Footnote body.`,
  html: `<article><h1 id="hello">Hello</h1><p><mark>Highlighted</mark> and <kbd>Ctrl</kbd>.</p><details open><summary>More</summary><p>Details body.</p></details><figure><img src="image.png" alt="Example"><figcaption>Caption</figcaption></figure></article>`,
  typst: `#set document(title: "Example")
= Hello <hello>

Text with #underline[underline], #highlight[highlight], and #footnote[note]. See @hello.

#quote(block: true)[A block quote.]`,
  latex: `\\title{Example}
\\author{Yuki}
\\section{Hello}\\label{sec:hello}

Text with \\underline{underline}, \\hl{highlight}, and \\footnote{note}. See \\ref{sec:hello}.

\\begin{figure}\\includegraphics{image.png}\\caption{Caption}\\end{figure}`,
};

const diagnosticLabels: Record<string, string> = {
  raw_preserved: "部分块内容没有目标格式的等价结构，已保留为原始内容。",
  raw_inline_preserved: "部分行内内容没有目标格式的等价结构，已保留。",
  details_degraded: "可折叠内容在目标格式中会转换为静态内容。",
  span_attributes_degraded: "目标格式无法保留全部 span 自定义属性。",
  metadata_custom: "目标格式无法保留全部自定义文档元数据。",
  parse_error: "输入中存在无法完整解析的语法。",
};

export function formatFromFilename(filename: string): FormatName | undefined {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return extensionFormats[extension];
}

export function diagnosticLabel(code: string, fallback: string): string {
  return diagnosticLabels[code] ?? fallback;
}

export function createPreviewDocument(content: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'">
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 24px; color: #18181b; background: #ffffff; font: 15px/1.75 system-ui, sans-serif; }
    h1, h2, h3, h4, h5, h6 { margin: 1.4em 0 .6em; color: #09090b; line-height: 1.3; }
    h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
    h1 { font-size: 1.65rem; } h2 { font-size: 1.35rem; } h3 { font-size: 1.15rem; }
    p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
    a { color: #18181b; pointer-events: none; } img { max-width: 100%; height: auto; }
    blockquote { margin-left: 0; padding-left: 1em; border-left: 2px solid #d4d4d8; color: #52525b; }
    aside.admonition { margin: 0 0 1em; padding: 12px 14px; border-left: 3px solid #71717a; background: #f4f4f5; }
    .admonition-title { display: block; margin-bottom: .4em; } details, figure { margin: 0 0 1em; }
    summary { cursor: pointer; color: #09090b; } figcaption { margin-top: .5em; color: #52525b; text-align: center; }
    mark { padding: 0 .18em; color: #09090b; background: #d4d4d8; } kbd { padding: 1px 5px; border: 1px solid #a1a1aa; background: #f4f4f5; }
    .small-caps { font-variant: small-caps; } .page-break { margin: 1.5em 0; border-top: 1px dashed #a1a1aa; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    code { color: #09090b; } pre { overflow: auto; padding: 12px; background: #f4f4f5; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 7px 9px; border: 1px solid #e4e4e7; text-align: left; }
  </style>
</head>
<body>${content}</body>
</html>`;
}
