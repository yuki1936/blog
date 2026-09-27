import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  ChevronsLeftRight,
  Copy,
  Download,
  ImageUp,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BlurHashError, decode, encode } from "@/lib/blurhash";

function bounded(value: string, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(maximum, Math.round(number)))
    : fallback;
}

export default function BlurHashTool() {
  const hydrated = useHydrated();
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const blurRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const loading = useRef(0);
  const urls = useRef(new Set<string>());
  const [hash, setHash] = useState("");
  const [components, setComponents] = useState({ x: "4", y: "3" });
  const [size, setSize] = useState({ width: "64", height: "42" });
  const [decodedSize, setDecodedSize] = useState("64 × 42 px");
  const [sourceSize, setSourceSize] = useState("160 × 104");
  const [encodeTime, setEncodeTime] = useState("0 ms");
  const [aspect, setAspect] = useState(800 / 520);
  const [punch, setPunch] = useState(1);
  const [compare, setCompare] = useState(52);
  const [view, setView] = useState("compare");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState({
    message: "内置样例",
    state: "success",
  });

  function renderHash(value = hash, nextSize = size, nextPunch = punch) {
    try {
      const width = bounded(nextSize.width, 2048, 64);
      const height = bounded(nextSize.height, 2048, 42);
      setSize({ width: String(width), height: String(height) });
      if (width * height > 1_048_576)
        throw new BlurHashError("解码输出不能超过 1,048,576 像素");
      const pixels = decode(value.trim(), width, height, nextPunch);
      const canvas = blurRef.current!;
      canvas.width = width;
      canvas.height = height;
      canvas
        .getContext("2d")
        ?.putImageData(
          new ImageData(new Uint8ClampedArray(pixels), width, height),
          0,
          0,
        );
      setDecodedSize(`${width} × ${height} px`);
      setError("");
      return true;
    } catch (error) {
      setError(
        error instanceof BlurHashError ? error.message : "无法解码该 Hash",
      );
      setStatus({ message: "Hash 无效", state: "error" });
      return false;
    }
  }

  function encodeSource(label: string, next = components) {
    const source = sourceRef.current!;
    const scale = Math.min(1, 160 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const x = bounded(next.x, 9, 4);
    const y = bounded(next.y, 9, 3);
    setComponents({ x: String(x), y: String(y) });
    context.drawImage(source, 0, 0, width, height);
    const start = performance.now();
    const value = encode(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
      x,
      y,
    );
    setHash(value);
    setEncodeTime(`${(performance.now() - start).toFixed(1)} ms`);
    setSourceSize(`${width} × ${height}`);
    setAspect(source.width / source.height);
    canvas.width = 0;
    canvas.height = 0;
    if (renderHash(value)) setStatus({ message: label, state: "success" });
  }

  useEffect(() => {
    const canvas = sourceRef.current!;
    canvas.width = 800;
    canvas.height = 520;
    const context = canvas.getContext("2d");
    if (!context) {
      setStatus({ message: "当前浏览器不支持 Canvas", state: "error" });
      return;
    }
    context.fillStyle = "#b9d9dc";
    context.fillRect(0, 0, 800, 520);
    context.fillStyle = "#e8c66a";
    context.beginPath();
    context.arc(660, 100, 62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#407d70";
    context.beginPath();
    context.moveTo(0, 310);
    context.bezierCurveTo(150, 210, 245, 350, 390, 260);
    context.bezierCurveTo(540, 170, 660, 300, 800, 205);
    context.lineTo(800, 520);
    context.lineTo(0, 520);
    context.fill();
    context.fillStyle = "#163e46";
    context.beginPath();
    context.moveTo(0, 400);
    context.bezierCurveTo(180, 300, 310, 440, 510, 330);
    context.bezierCurveTo(660, 250, 730, 365, 800, 315);
    context.lineTo(800, 520);
    context.lineTo(0, 520);
    context.fill();
    context.fillStyle = "#df654f";
    context.fillRect(116, 224, 108, 164);
    context.fillStyle = "#f6f1e5";
    context.beginPath();
    context.moveTo(92, 230);
    context.lineTo(170, 162);
    context.lineTo(248, 230);
    context.fill();
    context.fillStyle = "#29454b";
    context.fillRect(150, 310, 38, 78);
    encodeSource("内置样例");
    return () => {
      loading.current += 1;
      cancelAnimationFrame(frame.current);
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  async function loadFile(file?: File) {
    if (!file) return;
    const id = ++loading.current;
    if (!file.type.startsWith("image/"))
      return setStatus({ message: "请选择图片文件", state: "error" });
    if (file.size > 25 * 1024 * 1024)
      return setStatus({ message: "图片不能超过 25 MiB", state: "error" });
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (id !== loading.current) return;
      const canvas = sourceRef.current!;
      const scale = Math.min(
        1,
        1600 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      encodeSource(file.name);
    } catch {
      if (id === loading.current)
        setStatus({ message: "无法读取图片", state: "error" });
    } finally {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  }

  return (
    <TooltipProvider>
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        disabled={!hydrated}
        aria-busy={!hydrated}
      >
        <label
          id="blurhash-drop-zone"
          htmlFor="blurhash-file"
          className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed bg-muted/20 p-4 hover:bg-accent data-[dragging=true]:bg-accent"
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
          <ImageUp size={22} />
          <span className="grid">
            <strong className="text-sm font-semibold">选择图片</strong>
            <small className="text-xs text-muted-foreground">
              或拖放到这里
            </small>
          </span>
          <input
            id="blurhash-file"
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
        </label>
        <div className="mt-6 grid min-w-0 gap-6 min-[821px]:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0" aria-label="BlurHash 图片预览">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Tabs value={view} onValueChange={setView}>
                <TabsList aria-label="预览模式">
                  <TabsTrigger
                    id="blurhash-view-original"
                    value="original"
                    aria-controls="blurhash-preview"
                  >
                    原图
                  </TabsTrigger>
                  <TabsTrigger
                    id="blurhash-view-blur"
                    value="blur"
                    aria-controls="blurhash-preview"
                  >
                    占位图
                  </TabsTrigger>
                  <TabsTrigger
                    id="blurhash-view-compare"
                    value="compare"
                    aria-controls="blurhash-preview"
                  >
                    对比
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span
                id="blurhash-decoded-size"
                className="font-mono text-xs text-muted-foreground"
              >
                {decodedSize}
              </span>
            </div>
            <div className="image-stage grid min-h-[240px] place-items-center rounded-md border bg-muted/30 p-3 sm:min-h-[320px] min-[821px]:min-h-[500px]">
              <div
                id="blurhash-preview"
                role="tabpanel"
                aria-labelledby={`blurhash-view-${view}`}
                data-view={view}
                className="relative w-full overflow-hidden"
                style={{ aspectRatio: aspect }}
              >
                <canvas
                  ref={blurRef}
                  id="blurhash-canvas"
                  aria-label="BlurHash 占位图"
                  className="absolute inset-0 h-full w-full"
                  hidden={view === "original"}
                />
                <canvas
                  ref={sourceRef}
                  id="blurhash-source"
                  aria-label="原图"
                  className="absolute inset-0 h-full w-full"
                  hidden={view === "blur"}
                  style={{
                    clipPath:
                      view === "compare"
                        ? `inset(0 ${100 - compare}% 0 0)`
                        : "none",
                  }}
                />
                <div
                  id="blurhash-divider"
                  hidden={view !== "compare"}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-px bg-white"
                  style={{ left: `${compare}%` }}
                >
                  <span className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-background">
                    <ChevronsLeftRight size={16} />
                  </span>
                </div>
              </div>
            </div>
            <input
              id="blurhash-compare"
              className="mt-2 h-6 w-full"
              type="range"
              min="0"
              max="100"
              value={compare}
              hidden={view !== "compare"}
              aria-label="原图与占位图对比位置"
              onChange={(event) => setCompare(Number(event.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              编码输入{" "}
              <b id="blurhash-source-size" className="font-mono font-medium">
                {sourceSize}
              </b>
            </p>
          </section>
          <aside
            className="tool-settings grid content-start gap-5"
            aria-label="BlurHash 参数"
          >
            <fieldset>
              <legend>编码参数</legend>
              <div className="grid grid-cols-2 gap-3">
                {(["x", "y"] as const).map((key) => (
                  <label key={key} className="field-label">
                    {key === "x" ? "横向分量" : "纵向分量"}
                    <Input
                      id={`blurhash-components-${key}`}
                      type="number"
                      min="1"
                      max="9"
                      value={components[key]}
                      onChange={(event) => {
                        const next = {
                          ...components,
                          [key]: event.target.value,
                        };
                        setComponents(next);
                      }}
                      onBlur={() => encodeSource("参数已更新")}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-2 flex justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                <span>
                  <b id="blurhash-char-count">{hash.trim().length}</b> 字符
                </span>
                <span>
                  <b id="blurhash-component-count">
                    {bounded(components.x, 9, 4) * bounded(components.y, 9, 3)}
                  </b>{" "}
                  分量
                </span>
                <span id="blurhash-encode-time">{encodeTime}</span>
              </div>
            </fieldset>
            <fieldset>
              <legend>BlurHash</legend>
              <div className="relative">
                <Textarea
                  id="blurhash-value"
                  className="min-h-24 pr-10 font-mono text-xs break-all"
                  rows={3}
                  spellCheck={false}
                  aria-label="BlurHash 字符串"
                  value={hash}
                  onChange={(event) => {
                    setHash(event.target.value);
                    setError("");
                  }}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      id="blurhash-copy"
                      className="absolute top-1 right-1"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="复制 BlurHash"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(hash.trim());
                          setStatus({
                            message: "已复制 BlurHash",
                            state: "success",
                          });
                        } catch {
                          setStatus({
                            message: "无法访问剪贴板",
                            state: "error",
                          });
                        }
                      }}
                    >
                      <Copy />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制 BlurHash</TooltipContent>
                </Tooltip>
              </div>
              <Button
                id="blurhash-decode"
                className="mt-2 w-full"
                variant="outline"
                onClick={() => {
                  if (renderHash())
                    setStatus({ message: "Hash 已解码", state: "success" });
                }}
              >
                <ScanLine />
                解码此 Hash
              </Button>
              <p
                id="blurhash-error"
                className="mt-2 text-sm text-destructive"
                role="alert"
                hidden={!error}
              >
                {error}
              </p>
            </fieldset>
            <fieldset>
              <legend>解码输出</legend>
              <div className="grid grid-cols-2 gap-3">
                {(["width", "height"] as const).map((key) => (
                  <label key={key} className="field-label">
                    {key === "width" ? "宽度" : "高度"}
                    <Input
                      id={`blurhash-${key}`}
                      type="number"
                      min="1"
                      max="2048"
                      value={size[key]}
                      onChange={(event) =>
                        setSize({ ...size, [key]: event.target.value })
                      }
                      onBlur={() => {
                        if (renderHash())
                          setStatus({
                            message: "输出尺寸已更新",
                            state: "success",
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="field-label mt-3">
                <span className="flex justify-between">
                  色彩增强
                  <output id="blurhash-punch-value">{punch.toFixed(1)}</output>
                </span>
                <input
                  id="blurhash-punch"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={punch}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setPunch(next);
                    cancelAnimationFrame(frame.current);
                    frame.current = requestAnimationFrame(() => {
                      if (renderHash(hash, size, next))
                        setStatus({
                          message: "色彩增强已更新",
                          state: "success",
                        });
                    });
                  }}
                />
              </label>
            </fieldset>
            <Button
              id="blurhash-download"
              className="w-full"
              onClick={async () => {
                if (!renderHash()) return;
                try {
                  const blob = await new Promise<Blob | null>((resolve) =>
                    blurRef.current!.toBlob(resolve, "image/png"),
                  );
                  if (!blob) throw new Error("无法生成占位图");
                  const url = URL.createObjectURL(blob);
                  urls.current.add(url);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "blurhash-placeholder.png";
                  link.click();
                  setTimeout(() => {
                    URL.revokeObjectURL(url);
                    urls.current.delete(url);
                  }, 1000);
                  setStatus({ message: "占位图已生成", state: "success" });
                } catch {
                  setStatus({ message: "占位图生成失败", state: "error" });
                }
              }}
            >
              <Download />
              下载占位图
            </Button>
            <p
              id="blurhash-status"
              className="status-line break-words"
              data-state={status.state}
              aria-live="polite"
            >
              {status.message}
            </p>
          </aside>
        </div>
      </fieldset>
    </TooltipProvider>
  );
}
