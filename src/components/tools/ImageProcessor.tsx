import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { zipSync } from "fflate";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  Archive,
  Crop,
  Download,
  Grid3x3,
  ImageDown,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateOutputSize,
  calculateSliceRegion,
  clamp,
  fileStem,
  formatBytes,
  imageExtension,
  normalizeGridSize,
} from "@/lib/image-processing";

type Region = { x: number; y: number; width: number; height: number };
type Source = {
  file: File;
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
};
type Output = {
  url: string;
  filename: string;
  info: string;
  slices: { url: string; filename: string; label: string; alt: string }[];
};

export default function ImageProcessor() {
  const hydrated = useHydrated();
  const [source, setSource] = useState<Source | null>(null);
  const [crop, setCrop] = useState<Region>({ x: 0, y: 0, width: 1, height: 1 });
  const [mode, setMode] = useState<"crop" | "split">("crop");
  const [rows, setRows] = useState("2");
  const [columns, setColumns] = useState("2");
  const [maxWidth, setMaxWidth] = useState("");
  const [mime, setMime] = useState("image/webp");
  const [quality, setQuality] = useState(82);
  const [output, setOutput] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState({ message: "", state: "" });
  const sourceRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const sourceUrl = useRef("");
  const outputUrls = useRef(new Set<string>());
  const operation = useRef(0);
  const loading = useRef(0);
  const dragStart = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const pendingFile = fileRef.current?.files?.[0];
    if (pendingFile) void loadFile(pendingFile);
    return () => {
      operation.current += 1;
      loading.current += 1;
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      for (const url of outputUrls.current) URL.revokeObjectURL(url);
    };
  }, []);

  function invalidate() {
    operation.current += 1;
    setBusy(false);
    setOutput(null);
    for (const url of outputUrls.current) URL.revokeObjectURL(url);
    outputUrls.current.clear();
  }
  function reject(message: string) {
    invalidate();
    setSource(null);
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    sourceUrl.current = "";
    if (fileRef.current) fileRef.current.value = "";
    setStatus({ message, state: "error" });
  }
  async function loadFile(file?: File) {
    if (!file) return;
    const id = ++loading.current;
    if (!file.type.startsWith("image/")) return reject("请选择有效的图片文件");
    if (file.size > 25 * 1024 * 1024) return reject("图片不能超过 25 MiB");
    invalidate();
    setSource(null);
    setStatus({ message: "正在读取图片…", state: "" });
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (id !== loading.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (
        !Number.isSafeInteger(width * height) ||
        width * height > 25_000_000
      ) {
        URL.revokeObjectURL(url);
        return reject("图片不能超过 2500 万像素");
      }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url;
      setSource({ file, image, url, width, height });
      setCrop({ x: 0, y: 0, width, height });
      setStatus({
        message: `${width} × ${height} · ${formatBytes(file.size)}`,
        state: "",
      });
    } catch {
      URL.revokeObjectURL(url);
      if (id === loading.current) reject("无法读取这张图片");
    }
  }

  function updateCrop(next: Region) {
    if (!source) return;
    const x = clamp(Math.round(next.x) || 0, 0, source.width - 1);
    const y = clamp(Math.round(next.y) || 0, 0, source.height - 1);
    setCrop({
      x,
      y,
      width: clamp(Math.round(next.width) || 1, 1, source.width - x),
      height: clamp(Math.round(next.height) || 1, 1, source.height - y),
    });
    invalidate();
  }
  function point(event: PointerEvent) {
    const rect = sourceRef.current!.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  }

  async function processImage() {
    if (!source || busy) return;
    invalidate();
    const id = operation.current;
    setBusy(true);
    const localUrls: string[] = [];
    let published = false;
    const createUrl = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      localUrls.push(url);
      return url;
    };
    const current = () => id === operation.current;
    const extension = imageExtension(mime);
    const base = fileStem(source.file.name);
    async function render(region: Region) {
      const size = calculateOutputSize(
        region.width,
        region.height,
        Number(maxWidth),
      );
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器不支持 Canvas");
      context.drawImage(
        source!.image,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        size.width,
        size.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("无法生成图片"))),
          mime,
          quality / 100,
        ),
      );
      canvas.width = 0;
      canvas.height = 0;
      return { blob, ...size };
    }
    try {
      let next: Output;
      if (mode === "crop") {
        setStatus({ message: "正在生成…", state: "" });
        const result = await render(crop);
        if (!current()) return;
        next = {
          url: createUrl(result.blob),
          filename: `${base}-processed.${extension}`,
          info: `${result.width} × ${result.height} · ${formatBytes(result.blob.size)}`,
          slices: [],
        };
      } else {
        const rowCount = normalizeGridSize(rows);
        const columnCount = normalizeGridSize(columns);
        if (rowCount * columnCount > 100)
          throw new Error("最多生成 100 个切片");
        if (rowCount > source.height || columnCount > source.width)
          throw new Error("行列数不能超过图片的像素尺寸");
        setRows(String(rowCount));
        setColumns(String(columnCount));
        setStatus({
          message: `正在生成 ${rowCount * columnCount} 个切片…`,
          state: "",
        });
        const files: Record<string, Uint8Array> = {};
        const slices: Output["slices"] = [];
        let totalSize = 0;
        for (let row = 0; row < rowCount; row++)
          for (let column = 0; column < columnCount; column++) {
            const result = await render(
              calculateSliceRegion(
                source.width,
                source.height,
                rowCount,
                columnCount,
                row,
                column,
              ),
            );
            if (!current()) return;
            const filename = `${base}-r${String(row + 1).padStart(2, "0")}-c${String(column + 1).padStart(2, "0")}.${extension}`;
            files[filename] = new Uint8Array(await result.blob.arrayBuffer());
            if (!current()) return;
            totalSize += result.blob.size;
            slices.push({
              url: createUrl(result.blob),
              filename,
              label: `${row + 1}, ${column + 1} · ${result.width} × ${result.height}`,
              alt: `第 ${row + 1} 行第 ${column + 1} 列切片`,
            });
          }
        const archive = zipSync(files, { level: 0 });
        next = {
          url: createUrl(
            new Blob([new Uint8Array(archive)], { type: "application/zip" }),
          ),
          filename: `${base}-${rowCount}x${columnCount}.zip`,
          info: `${rowCount} × ${columnCount} · ${slices.length} 个切片 · ${formatBytes(totalSize)}`,
          slices,
        };
      }
      if (!current()) return;
      for (const url of localUrls) outputUrls.current.add(url);
      published = true;
      setOutput(next);
      setStatus({
        message: next.slices.length
          ? `${next.slices.length} 个切片已生成`
          : "图片已生成",
        state: "success",
      });
      requestAnimationFrame(() => {
        if (current())
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      });
    } catch (error) {
      if (current())
        setStatus({
          message: error instanceof Error ? error.message : "无法生成图片",
          state: "error",
        });
    } finally {
      if (!published) for (const url of localUrls) URL.revokeObjectURL(url);
      if (current()) setBusy(false);
    }
  }

  const rowCount = normalizeGridSize(rows);
  const columnCount = normalizeGridSize(columns);
  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      disabled={!hydrated}
      aria-busy={!hydrated}
    >
      <label
        className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed bg-muted/20 p-4 hover:bg-accent data-[dragging=true]:bg-accent"
        id="upload-zone"
        htmlFor="image-input"
        data-dragging={dragging}
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
        <Upload size={22} />
        <span className="grid">
          <strong className="text-sm font-semibold">选择图片</strong>
          <small className="text-xs text-muted-foreground">或拖放到这里</small>
        </span>
        <input
          ref={fileRef}
          id="image-input"
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
          }}
        />
      </label>
      <p
        id="image-status"
        className="status-line mt-3 break-words"
        data-state={status.state}
        aria-live="polite"
      >
        {status.message}
      </p>
      <div
        id="image-workspace"
        hidden={!source}
        className="mt-5 grid min-w-0 gap-6 min-[821px]:grid-cols-[minmax(0,1fr)_300px]"
      >
        <section className="min-w-0" aria-label="裁切区域">
          <div className="image-stage grid min-h-[320px] place-items-center overflow-hidden rounded-md border bg-muted/30 min-[821px]:min-h-[500px]">
            <div
              id="image-frame"
              role="tabpanel"
              aria-labelledby={`image-mode-${mode}`}
              className="relative inline-block max-w-full touch-none overflow-hidden leading-none select-none"
              onPointerDown={(event) => {
                if (mode !== "crop" || !source) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragStart.current = {
                  ...point(event),
                  clientX: event.clientX,
                  clientY: event.clientY,
                  moved: false,
                };
              }}
              onPointerMove={(event) => {
                const start = dragStart.current;
                const image = sourceRef.current;
                if (!start || !source || !image) return;
                if (
                  !start.moved &&
                  Math.hypot(
                    event.clientX - start.clientX,
                    event.clientY - start.clientY,
                  ) < 4
                )
                  return;
                start.moved = true;
                const next = point(event);
                updateCrop({
                  x:
                    (Math.min(start.x, next.x) * source.width) /
                    image.clientWidth,
                  y:
                    (Math.min(start.y, next.y) * source.height) /
                    image.clientHeight,
                  width: Math.max(
                    1,
                    (Math.abs(next.x - start.x) * source.width) /
                      image.clientWidth,
                  ),
                  height: Math.max(
                    1,
                    (Math.abs(next.y - start.y) * source.height) /
                      image.clientHeight,
                  ),
                });
              }}
              onPointerUp={() => {
                dragStart.current = null;
              }}
              onPointerCancel={() => {
                dragStart.current = null;
              }}
            >
              {source && (
                <img
                  ref={sourceRef}
                  id="source-image"
                  src={source.url}
                  className="block max-h-[640px] max-w-full object-contain"
                  alt="待处理图片预览"
                  draggable={false}
                />
              )}
              <div
                id="crop-selection"
                className="pointer-events-none absolute border border-white shadow-[0_0_0_9999px_rgb(0_0_0/35%)]"
                aria-hidden="true"
                hidden={mode !== "crop"}
                style={
                  source
                    ? {
                        left: `${(crop.x / source.width) * 100}%`,
                        top: `${(crop.y / source.height) * 100}%`,
                        width: `${(crop.width / source.width) * 100}%`,
                        height: `${(crop.height / source.height) * 100}%`,
                      }
                    : undefined
                }
              />
              <div
                id="grid-overlay"
                className="pointer-events-none absolute inset-0 border border-white"
                aria-hidden="true"
                hidden={mode !== "split"}
                style={
                  {
                    backgroundImage:
                      "linear-gradient(to right, transparent calc(100% - 1px), white 0), linear-gradient(to bottom, transparent calc(100% - 1px), white 0)",
                    backgroundSize: `${100 / columnCount}% 100%, 100% ${100 / rowCount}%`,
                  } as CSSProperties
                }
              />
            </div>
          </div>
          <p
            id="stage-caption"
            className="mt-2 text-center text-xs text-muted-foreground"
          >
            {mode === "split"
              ? `${rowCount} × ${columnCount} · ${rowCount * columnCount} 片`
              : source
                ? `${source.width} × ${source.height}`
                : ""}
          </p>
        </section>
        <aside className="tool-settings grid content-start gap-5">
          <fieldset>
            <legend>处理方式</legend>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as typeof mode);
                invalidate();
              }}
            >
              <TabsList className="w-full" aria-label="处理方式">
                <TabsTrigger
                  id="image-mode-crop"
                  value="crop"
                  aria-controls="image-frame"
                >
                  <Crop />
                  裁切
                </TabsTrigger>
                <TabsTrigger
                  id="image-mode-split"
                  value="split"
                  aria-controls="image-frame"
                >
                  <Grid3x3 />
                  等分
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </fieldset>
          <fieldset id="crop-controls" hidden={mode !== "crop"}>
            <legend>裁切区域</legend>
            <div className="grid grid-cols-2 gap-3">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key} className="field-label">
                  {{ x: "X", y: "Y", width: "宽度", height: "高度" }[key]}
                  <Input
                    id={`crop-${key}`}
                    type="number"
                    min={key === "x" || key === "y" ? 0 : 1}
                    value={crop[key]}
                    onChange={(event) =>
                      updateCrop({ ...crop, [key]: Number(event.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset id="split-controls" hidden={mode !== "split"}>
            <legend>切片网格</legend>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[2, 3, 4].map((size) => (
                <Button
                  key={size}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRows(String(size));
                    setColumns(String(size));
                    invalidate();
                  }}
                >
                  {size} × {size}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                行数
                <Input
                  id="split-rows"
                  type="number"
                  min="1"
                  max="10"
                  value={rows}
                  onChange={(event) => {
                    setRows(event.target.value);
                    invalidate();
                  }}
                  onBlur={() => setRows(String(rowCount))}
                />
              </label>
              <label className="field-label">
                列数
                <Input
                  id="split-columns"
                  type="number"
                  min="1"
                  max="10"
                  value={columns}
                  onChange={(event) => {
                    setColumns(event.target.value);
                    invalidate();
                  }}
                  onBlur={() => setColumns(String(columnCount))}
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>输出</legend>
            <div className="grid gap-3">
              <label className="field-label">
                <span id="output-width-label">
                  {mode === "crop" ? "最大宽度" : "单片最大宽度"}
                </span>
                <Input
                  id="output-width"
                  type="number"
                  min="1"
                  placeholder={source ? String(source.width) : "保持原尺寸"}
                  value={maxWidth}
                  onChange={(event) => {
                    setMaxWidth(event.target.value);
                    invalidate();
                  }}
                />
              </label>
              <label className="field-label">
                格式
                <select
                  className="select"
                  id="output-format"
                  value={mime}
                  onChange={(event) => {
                    setMime(event.target.value);
                    invalidate();
                  }}
                >
                  <option value="image/webp">WebP</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                </select>
              </label>
              <label className="field-label">
                <span className="flex justify-between">
                  质量<output id="quality-value">{quality}%</output>
                </span>
                <input
                  id="output-quality"
                  type="range"
                  min="10"
                  max="100"
                  value={quality}
                  disabled={mime === "image/png"}
                  onChange={(event) => {
                    setQuality(Number(event.target.value));
                    invalidate();
                  }}
                />
              </label>
            </div>
          </fieldset>
          <Button
            id="process-image"
            className="w-full"
            disabled={busy || !source}
            onClick={() => void processImage()}
          >
            <ImageDown />
            <span id="process-label">
              {mode === "crop" ? "生成图片" : "生成切片"}
            </span>
          </Button>
        </aside>
      </div>
      <section
        ref={resultRef}
        id="output-panel"
        hidden={!output}
        className="mt-12 scroll-mt-22"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="min-w-0">
            <h2>处理结果</h2>
            <p
              id="output-info"
              className="mt-1 break-words text-xs text-muted-foreground"
            >
              {output?.info}
            </p>
          </div>
          {output && (
            <Button variant="outline" asChild>
              <a
                id={output.slices.length ? "download-slices" : "download-image"}
                href={output.url}
                download={output.filename}
              >
                {output.slices.length ? <Archive /> : <Download />}
                {output.slices.length ? "下载 ZIP" : "下载"}
              </a>
            </Button>
          )}
        </div>
        <div
          id="single-output"
          hidden={!output || !!output.slices.length}
          className="grid min-h-60 place-items-center rounded-md border bg-muted/30 p-4"
        >
          {output && !output.slices.length && (
            <img
              id="output-image"
              src={output.url}
              className="max-h-[640px] max-w-full"
              alt="处理后的图片预览"
            />
          )}
        </div>
        <div
          id="slice-results"
          hidden={!output?.slices.length}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {output?.slices.map((slice) => (
            <article
              key={slice.filename}
              className="slice-card min-w-0 overflow-hidden rounded-md border"
            >
              <div className="slice-preview grid aspect-square place-items-center overflow-hidden bg-muted/30">
                <img
                  src={slice.url}
                  className="max-h-full max-w-full"
                  alt={slice.alt}
                />
              </div>
              <div className="slice-details flex items-center justify-between gap-2 p-2 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">
                  {slice.label}
                </span>
                <a
                  className="shrink-0 hover:underline"
                  href={slice.url}
                  download={slice.filename}
                >
                  下载
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </fieldset>
  );
}
