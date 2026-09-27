import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  ArrowLeftRight,
  Clipboard,
  Download,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONVERSION_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
  createPreviewDocument,
  diagnosticLabel,
  formatExamples,
  formatExtensions,
  formatFromFilename,
  formatLabels,
  formatMimeTypes,
  type FormatName,
  type MarkweftWorkerRequest,
  type MarkweftWorkerResponse,
} from "@/lib/markup-converter";

type Result = Extract<MarkweftWorkerResponse, { type: "result" }>;
type View = "source" | "preview" | "ast";
const formats = Object.keys(formatLabels) as FormatName[];

export default function MarkupConverter() {
  const hydrated = useHydrated();
  const [source, setSource] = useState("");
  const [from, setFrom] = useState<FormatName | "auto">("auto");
  const [to, setTo] = useState<FormatName>("html");
  const [strict, setStrict] = useState(false);
  const [fullHtml, setFullHtml] = useState(false);
  const [linkPrefix, setLinkPrefix] = useState("");
  const [imagePrefix, setImagePrefix] = useState("");
  const [view, setView] = useState<View>("source");
  const [result, setResult] = useState<Result | null>(null);
  const [ready, setReady] = useState(false);
  const [converting, setConverting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState({
    message: "正在载入转换器…",
    state: "",
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const readyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileRequest = useRef(0);
  const mounted = useRef(false);
  const downloadUrls = useRef(new Set<string>());

  function startWorker(preserveStatus = false) {
    clearTimeout(timer.current);
    workerRef.current?.terminate();
    readyRef.current = false;
    busy.current = false;
    setReady(false);
    setConverting(false);
    const worker = new Worker(
      new URL("../../workers/markweft.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<MarkweftWorkerResponse>) => {
      if (workerRef.current !== worker) return;
      if (data.type === "ready") {
        readyRef.current = true;
        setReady(true);
        if (!preserveStatus)
          setStatus({ message: "转换器已就绪", state: "success" });
      } else if (data.type === "result" && data.id === requestId.current) {
        clearTimeout(timer.current);
        busy.current = false;
        setConverting(false);
        setResult(data);
        setStatus({ message: "转换完成", state: "success" });
      } else if (
        data.type === "error" &&
        (data.id === undefined || data.id === requestId.current)
      ) {
        clearTimeout(timer.current);
        busy.current = false;
        setConverting(false);
        setStatus({ message: data.message || "转换失败", state: "error" });
      }
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      clearTimeout(timer.current);
      busy.current = false;
      readyRef.current = false;
      setConverting(false);
      setReady(false);
      setStatus({ message: "无法载入转换器", state: "error" });
    };
    worker.postMessage({ type: "init" } satisfies MarkweftWorkerRequest);
  }

  useEffect(() => {
    mounted.current = true;
    startWorker();
    return () => {
      mounted.current = false;
      fileRequest.current += 1;
      requestId.current += 1;
      clearTimeout(timer.current);
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const url of downloadUrls.current) URL.revokeObjectURL(url);
    };
  }, []);

  function invalidate() {
    requestId.current += 1;
    if (busy.current) startWorker(true);
    setResult(null);
    setView("source");
    setStatus({
      message: readyRef.current ? "内容已修改，请重新转换" : "正在载入转换器…",
      state: "",
    });
  }

  function convert() {
    if (!source.trim())
      return setStatus({ message: "请输入需要转换的内容", state: "error" });
    if (new Blob([source]).size > MAX_DOCUMENT_BYTES)
      return setStatus({ message: "文档不能超过 5 MiB", state: "error" });
    if (!readyRef.current || busy.current) return;
    const id = ++requestId.current;
    busy.current = true;
    setConverting(true);
    setStatus({ message: "正在转换…", state: "" });
    timer.current = setTimeout(() => {
      if (id !== requestId.current || !busy.current) return;
      requestId.current += 1;
      startWorker(true);
      setStatus({ message: "转换超时，请缩小文档后重试", state: "error" });
    }, CONVERSION_TIMEOUT_MS);
    workerRef.current?.postMessage({
      type: "convert",
      id,
      source,
      from,
      to,
      options: {
        mode: strict ? "strict" : "compatible",
        full_html_document: fullHtml && to === "html",
        link_prefix: linkPrefix.trim() || undefined,
        image_prefix: imagePrefix.trim() || undefined,
      },
    } satisfies MarkweftWorkerRequest);
  }

  async function loadFile(file?: File) {
    if (!file) return;
    const id = ++fileRequest.current;
    if (file.size > MAX_DOCUMENT_BYTES)
      return setStatus({ message: "文件不能超过 5 MiB", state: "error" });
    try {
      const text = await file.text();
      if (!mounted.current || id !== fileRequest.current) return;
      setSource(text);
      const format = formatFromFilename(file.name);
      if (format) setFrom(format);
      invalidate();
      setStatus({ message: `${file.name} 已导入`, state: "success" });
    } catch {
      if (mounted.current && id === fileRequest.current)
        setStatus({ message: "无法读取这个文件", state: "error" });
    }
  }

  const output =
    view === "ast" ? (result?.astJson ?? "") : (result?.output ?? "");
  return (
    <TooltipProvider>
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        disabled={!hydrated}
        aria-busy={!hydrated}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
          <label className="field-label">
            输入格式
            <select
              className="select"
              id="source-format"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value as typeof from);
                invalidate();
              }}
            >
              <option value="auto">自动识别</option>
              {formats.map((format) => (
                <option key={format} value={format}>
                  {formatLabels[format]}
                </option>
              ))}
            </select>
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="swap-formats"
                size="icon"
                variant="outline"
                className="h-[42px] w-[42px]"
                aria-label="交换输入与输出格式"
                onClick={() => {
                  const previousSource =
                    from === "auto"
                      ? (result?.detectedFormat ?? "markdown")
                      : from;
                  setFrom(to);
                  setTo(previousSource);
                  if (previousSource !== "html") setFullHtml(false);
                  if (result?.output) setSource(result.output);
                  invalidate();
                  setStatus({ message: "格式已交换", state: "" });
                }}
              >
                <ArrowLeftRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>交换格式</TooltipContent>
          </Tooltip>
          <label className="field-label">
            输出格式
            <select
              className="select"
              id="target-format"
              value={to}
              onChange={(event) => {
                const next = event.target.value as FormatName;
                setTo(next);
                if (next !== "html") setFullHtml(false);
                invalidate();
              }}
            >
              {["html", "markdown", "typst", "latex"].map((format) => (
                <option key={format} value={format}>
                  {formatLabels[format as FormatName]}
                </option>
              ))}
            </select>
          </label>
          <Button
            id="convert-document"
            className="col-span-3 h-[42px] sm:col-span-1"
            disabled={!ready || converting}
            onClick={convert}
          >
            <Play />
            转换
          </Button>
        </div>
        <details className="converter-options mt-5 border-y py-3">
          <summary className="cursor-pointer text-sm font-medium">选项</summary>
          <div className="grid gap-4 pt-4 sm:grid-cols-3">
            <label className="field-label">
              示例
              <select
                className="select"
                id="example-input"
                defaultValue=""
                onChange={(event) => {
                  const format = event.target.value as FormatName;
                  if (!formatExamples[format]) return;
                  fileRequest.current += 1;
                  setSource(formatExamples[format]);
                  setFrom(format);
                  invalidate();
                }}
              >
                <option value="">选择示例</option>
                {formats.map((format) => (
                  <option key={format} value={format}>
                    {formatLabels[format]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              链接前缀
              <Input
                id="link-prefix"
                placeholder="/docs"
                value={linkPrefix}
                onChange={(event) => {
                  setLinkPrefix(event.target.value);
                  invalidate();
                }}
              />
            </label>
            <label className="field-label">
              图片前缀
              <Input
                id="image-prefix"
                placeholder="/assets"
                value={imagePrefix}
                onChange={(event) => {
                  setImagePrefix(event.target.value);
                  invalidate();
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="strict-mode"
                type="checkbox"
                checked={strict}
                onChange={(event) => {
                  setStrict(event.target.checked);
                  invalidate();
                }}
              />
              严格模式
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="full-html"
                type="checkbox"
                checked={fullHtml}
                disabled={to !== "html"}
                onChange={(event) => {
                  setFullHtml(event.target.checked);
                  invalidate();
                }}
              />
              完整 HTML 文档
            </label>
          </div>
        </details>
        <p
          id="convert-status"
          className="status-line my-4 break-words"
          data-state={status.state}
          aria-live="polite"
        >
          {status.message}
        </p>
        <div
          id="conversion-diagnostics"
          hidden={!result?.diagnostics.length}
          className="mb-4 border-l-2 px-3 text-sm"
          aria-live="polite"
        >
          {result?.diagnostics.map((item, index) => (
            <p
              key={index}
              data-severity={item.severity}
              className={
                item.severity === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {item.line ? `（${item.line}:${item.column ?? 1}）` : ""}
              {diagnosticLabel(item.code, item.message)}
            </p>
          ))}
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <section
            id="input-panel"
            className={`min-w-0 ${dragging ? "outline-2 outline-ring" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void loadFile(event.dataTransfer.files[0]);
            }}
          >
            <div className="mb-3 flex h-9 items-center justify-between">
              <label htmlFor="document-input" className="text-sm font-medium">
                输入
              </label>
              <label
                className="tool-button min-h-8 cursor-pointer px-3 py-1 text-xs"
                htmlFor="document-file"
              >
                <Upload size={14} />
                导入
                <input
                  id="document-file"
                  className="sr-only"
                  type="file"
                  accept=".md,.markdown,.html,.htm,.typ,.typst,.tex,.latex,text/*"
                  onChange={(event) => {
                    void loadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <Textarea
              ref={inputRef}
              id="document-input"
              className="h-[420px] min-h-[300px] resize-y font-mono text-sm leading-relaxed lg:h-[500px]"
              spellCheck={false}
              placeholder={"# Hello\n\nStart writing here…"}
              value={source}
              onChange={(event) => {
                fileRequest.current += 1;
                setSource(event.target.value);
                invalidate();
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  convert();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span id="input-characters">
                {source.length.toLocaleString()} 字符
              </span>
              <Button
                id="clear-document"
                variant="ghost"
                size="sm"
                onClick={() => {
                  fileRequest.current += 1;
                  setSource("");
                  invalidate();
                  setStatus({
                    message: readyRef.current
                      ? "转换器已就绪"
                      : "正在载入转换器…",
                    state: readyRef.current ? "success" : "",
                  });
                  inputRef.current?.focus();
                }}
              >
                <Trash2 />
                清空
              </Button>
            </div>
          </section>
          <section className="min-w-0">
            <Tabs value={view} onValueChange={(next) => setView(next as View)}>
              <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                <TabsList aria-label="输出视图">
                  <TabsTrigger id="source-view-tab" value="source">
                    源码
                  </TabsTrigger>
                  <TabsTrigger
                    id="preview-view-tab"
                    value="preview"
                    disabled={!result?.previewHtml}
                  >
                    预览
                  </TabsTrigger>
                  <TabsTrigger
                    id="ast-view-tab"
                    value="ast"
                    disabled={!result?.astJson}
                  >
                    AST
                  </TabsTrigger>
                </TabsList>
                <div className="flex gap-1">
                  <Button
                    id="copy-document"
                    variant="ghost"
                    size="sm"
                    disabled={!output}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(output);
                        setStatus({ message: "输出已复制", state: "success" });
                      } catch {
                        setStatus({
                          message: "浏览器拒绝了剪贴板访问",
                          state: "error",
                        });
                      }
                    }}
                  >
                    <Clipboard />
                    复制
                  </Button>
                  <Button
                    id="download-document"
                    variant="ghost"
                    size="sm"
                    disabled={!output}
                    onClick={() => {
                      const ast = view === "ast";
                      const url = URL.createObjectURL(
                        new Blob([output], {
                          type: ast
                            ? "application/json;charset=utf-8"
                            : formatMimeTypes[to],
                        }),
                      );
                      downloadUrls.current.add(url);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = ast
                        ? "document.ast.json"
                        : `converted.${formatExtensions[to]}`;
                      link.click();
                      setTimeout(() => {
                        URL.revokeObjectURL(url);
                        downloadUrls.current.delete(url);
                      }, 1000);
                      setStatus({ message: "下载已开始", state: "success" });
                    }}
                  >
                    <Download />
                    下载
                  </Button>
                </div>
              </div>
              <TabsContent
                value="source"
                forceMount
                hidden={view !== "source"}
                className="data-[state=inactive]:hidden"
              >
                <Textarea
                  id="document-output"
                  aria-labelledby="source-view-tab"
                  className="h-[420px] min-h-[300px] resize-y font-mono text-sm leading-relaxed lg:h-[500px]"
                  spellCheck={false}
                  readOnly
                  placeholder="转换结果"
                  value={result?.output ?? ""}
                />
              </TabsContent>
              <TabsContent
                value="preview"
                forceMount
                hidden={view !== "preview"}
                className="data-[state=inactive]:hidden"
              >
                <iframe
                  id="document-preview"
                  className="h-[420px] w-full rounded-md border bg-white lg:h-[500px]"
                  title="转换结果预览"
                  sandbox=""
                  srcDoc={
                    result?.previewHtml
                      ? createPreviewDocument(result.previewHtml)
                      : ""
                  }
                />
              </TabsContent>
              <TabsContent
                value="ast"
                forceMount
                hidden={view !== "ast"}
                className="data-[state=inactive]:hidden"
              >
                <Textarea
                  id="document-ast"
                  aria-labelledby="ast-view-tab"
                  className="h-[420px] min-h-[300px] resize-y font-mono text-sm leading-relaxed lg:h-[500px]"
                  spellCheck={false}
                  readOnly
                  value={result?.astJson ?? ""}
                />
              </TabsContent>
            </Tabs>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span id="output-characters">
                {output.length.toLocaleString()} 字符
              </span>
              <span id="detected-format">
                {result
                  ? `识别为 ${formatLabels[result.detectedFormat]} · ${Math.round(result.confidence * 100)}%`
                  : ""}
              </span>
            </div>
          </section>
        </div>
      </fieldset>
    </TooltipProvider>
  );
}
