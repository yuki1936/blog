import { useMemo, useRef, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  Braces,
  ChevronRight,
  Clipboard,
  Copy,
  Maximize2,
  Minimize2,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { generateGo, generateRust } from "@/lib/json-codegen";
import {
  editJson,
  jsonAtPath,
  jsonContainerPaths,
  type JsonPath,
} from "@/lib/json-editor";

type View = "tree" | "rust" | "go";
type NodeAction = (
  action: "edit" | "add" | "delete" | "copy",
  path: JsonPath,
) => void;
type NodeProps = {
  value: unknown;
  property: string | number | null;
  path: JsonPath;
  openPaths: Set<string>;
  toggle: (path: string, open: boolean) => void;
  action: NodeAction;
};

function JsonNode({
  value,
  property,
  path,
  openPaths,
  toggle,
  action,
}: NodeProps) {
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const container = value !== null && typeof value === "object";
  const keys = container ? Object.keys(value) : [];
  const pathId = JSON.stringify(path);
  const row = (
    <>
      {property !== null && (
        <span className="node-key shrink-0 font-semibold">
          {typeof property === "number" ? `[${property}]` : property}
        </span>
      )}
      <span className="node-type shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {type}
      </span>
      {container ? (
        <span className="node-count text-muted-foreground">
          {type === "array" ? "Array" : "Object"}({keys.length})
        </span>
      ) : (
        <span className={`node-value value-${type} min-w-0 break-all`}>
          {typeof value === "string" ? JSON.stringify(value) : String(value)}
        </span>
      )}
    </>
  );
  const rowClass =
    "json-node-row flex min-h-9 cursor-context-menu items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent";
  return (
    <ContextMenu>
      {container ? (
        <details
          className="json-node"
          data-json-path={pathId}
          open={openPaths.has(pathId)}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            if (open !== openPaths.has(pathId)) toggle(pathId, open);
          }}
        >
          <ContextMenuTrigger asChild>
            <summary
              className={`${rowClass} list-none cursor-pointer [&::-webkit-details-marker]:hidden`}
            >
              <ChevronRight
                className={`size-3 shrink-0 transition-transform ${openPaths.has(pathId) ? "rotate-90" : ""}`}
                aria-hidden="true"
              />
              {row}
            </summary>
          </ContextMenuTrigger>
          <div className="json-children ml-4 border-l pl-2">
            {keys.length ? (
              keys.map((key) => {
                const childProperty = Array.isArray(value) ? Number(key) : key;
                return (
                  <JsonNode
                    key={key}
                    value={(value as Record<string, unknown>)[key]}
                    property={childProperty}
                    path={[...path, childProperty]}
                    openPaths={openPaths}
                    toggle={toggle}
                    action={action}
                  />
                );
              })
            ) : (
              <span className="empty-container px-2 text-muted-foreground">
                {type === "array" ? "[]" : "{}"}
              </span>
            )}
          </div>
        </details>
      ) : (
        <ContextMenuTrigger asChild>
          <div tabIndex={0} className={`${rowClass} leaf-row`}>
            {row}
          </div>
        </ContextMenuTrigger>
      )}
      <ContextMenuContent>
        {container ? (
          <ContextMenuItem onSelect={() => action("add", path)}>
            <Plus />
            添加
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={() => action("edit", path)}>
            <Pencil />
            编辑值
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => action("copy", path)}>
          <Copy />
          复制节点
        </ContextMenuItem>
        {path.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => action("delete", path)}
            >
              <Trash2 />
              删除
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default function JsonViewer() {
  const hydrated = useHydrated();
  const [source, setSource] = useState("");
  const [parsed, setParsed] = useState<{ value: unknown } | null>(null);
  const [view, setView] = useState<View>("tree");
  const [openPaths, setOpenPaths] = useState(new Set(["[]"]));
  const [status, setStatus] = useState({ message: "等待输入", state: "" });
  const [editor, setEditor] = useState<{
    action: "edit" | "add";
    path: JsonPath;
    text: string;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rust = useMemo(
    () => (parsed ? generateRust(parsed.value) : ""),
    [parsed],
  );
  const go = useMemo(() => (parsed ? generateGo(parsed.value) : ""), [parsed]);

  function parse() {
    if (!source.trim())
      return setStatus({ message: "请输入 JSON 数据", state: "error" });
    try {
      setParsed({ value: JSON.parse(source) });
      setOpenPaths(new Set(["[]"]));
      setStatus({ message: "JSON 有效", state: "success" });
    } catch (error) {
      setParsed(null);
      const message = error instanceof Error ? error.message : "JSON 无效";
      const position = message.match(/position\s+(\d+)/i)?.[1];
      const before = position ? source.slice(0, Number(position)) : "";
      setStatus({
        message: position
          ? `第 ${before.split("\n").length} 行，第 ${Number(position) - before.lastIndexOf("\n")} 列：${message}`
          : message,
        state: "error",
      });
    }
  }
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ message, state: "success" });
    } catch {
      setStatus({ message: "复制失败，请检查剪贴板权限", state: "error" });
    }
  }
  const nodeAction: NodeAction = (action, path) => {
    if (!parsed) return;
    const current = jsonAtPath(parsed.value, path);
    if (action === "copy")
      return void copy(JSON.stringify(current, null, 2), "节点已复制");
    if (action === "edit") {
      setEditor({
        action,
        path,
        text: typeof current === "string" ? current : JSON.stringify(current),
      });
      return;
    } else if (action === "add" && !Array.isArray(current)) {
      setEditor({ action, path, text: "" });
      return;
    }
    const value = editJson(parsed.value, path, action);
    setParsed({ value });
    setSource(JSON.stringify(value, null, 2));
    setStatus({ message: "节点已更新", state: "success" });
  };

  function saveEdit() {
    if (!editor || !parsed) return;
    let next: unknown = editor.text;
    if (editor.action === "edit") {
      try {
        next = JSON.parse(editor.text);
      } catch {}
    }
    const value = editJson(
      parsed.value,
      editor.path,
      editor.action,
      next,
      editor.text,
    );
    setParsed({ value });
    setSource(JSON.stringify(value, null, 2));
    setStatus({ message: "节点已更新", state: "success" });
    setEditor(null);
  }

  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      disabled={!hydrated}
      aria-busy={!hydrated}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          parse();
        }
      }}
    >
      <div
        className="flex flex-wrap items-center gap-2 border-y py-3.5"
        role="toolbar"
        aria-label="JSON 操作"
      >
        <Button id="json-parse" onClick={parse}>
          <Play />
          解析
        </Button>
        <Button
          id="json-copy-result"
          variant="outline"
          onClick={() => {
            if (!parsed)
              return setStatus({ message: "没有可复制的结果", state: "error" });
            void copy(
              view === "rust"
                ? rust
                : view === "go"
                  ? go
                  : JSON.stringify(parsed.value, null, 2),
              "当前视图已复制",
            );
          }}
        >
          <Clipboard />
          复制当前视图
        </Button>
        <Button
          id="json-clear"
          variant="outline"
          onClick={() => {
            setSource("");
            setParsed(null);
            setOpenPaths(new Set(["[]"]));
            setStatus({ message: "已清空", state: "" });
            inputRef.current?.focus();
          }}
        >
          <Trash2 />
          清空
        </Button>
        <p
          id="json-status"
          className="status-line min-w-0 flex-1 basis-full break-words sm:basis-auto sm:text-right"
          data-state={status.state}
          aria-live="polite"
        >
          {status.message}
        </p>
      </div>
      <div className="grid min-w-0 gap-4 pt-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0">
          <label
            className="mb-3 block text-sm font-medium"
            htmlFor="json-input"
          >
            JSON 输入
          </label>
          <Textarea
            ref={inputRef}
            id="json-input"
            className="h-[360px] field-sizing-fixed font-mono text-sm leading-relaxed lg:h-[500px]"
            spellCheck={false}
            placeholder={'{ "name": "neri", "languages": ["Rust", "Go"] }'}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span id="json-characters">
              {source.length.toLocaleString()} 字符
            </span>
            <span id="json-lines">
              {source ? source.split("\n").length : 0} 行
            </span>
          </div>
        </section>
        <section className="min-w-0">
          <Tabs value={view} onValueChange={(value) => setView(value as View)}>
            <TabsList aria-label="查看模式" className="w-full">
              <TabsTrigger value="tree">树形视图</TabsTrigger>
              <TabsTrigger value="rust">Rust</TabsTrigger>
              <TabsTrigger value="go">Go</TabsTrigger>
            </TabsList>
            <TabsContent value="tree" id="tree-pane" className="min-w-0">
              <div id="tree-toolbar" className="flex gap-2 border-b py-2">
                <Button
                  id="expand-all"
                  variant="ghost"
                  size="sm"
                  title="全部展开"
                  onClick={() =>
                    setOpenPaths(
                      new Set(parsed ? jsonContainerPaths(parsed.value) : []),
                    )
                  }
                >
                  <Maximize2 />
                  全部展开
                </Button>
                <Button
                  id="collapse-all"
                  variant="ghost"
                  size="sm"
                  title="全部折叠"
                  onClick={() => setOpenPaths(new Set(["[]"]))}
                >
                  <Minimize2 />
                  全部折叠
                </Button>
              </div>
              <div className="viewer-pane tree-pane min-h-[320px] overflow-auto py-3 font-mono text-xs lg:min-h-[450px]">
                {!parsed ? (
                  <div
                    id="viewer-empty"
                    className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground"
                  >
                    <Braces size={24} />
                    <span>等待输入</span>
                  </div>
                ) : (
                  <div id="json-tree">
                    <JsonNode
                      value={parsed.value}
                      property={null}
                      path={[]}
                      openPaths={openPaths}
                      toggle={(path, open) =>
                        setOpenPaths((previous) => {
                          const next = new Set(previous);
                          if (open) next.add(path);
                          else next.delete(path);
                          return next;
                        })
                      }
                      action={nodeAction}
                    />
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="rust" id="rust-pane">
              <pre className="viewer-pane code-pane min-h-[360px] overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-relaxed">
                <code id="rust-output">{rust}</code>
              </pre>
            </TabsContent>
            <TabsContent value="go" id="go-pane">
              <pre className="viewer-pane code-pane min-h-[360px] overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-relaxed">
                <code id="go-output">{go}</code>
              </pre>
            </TabsContent>
          </Tabs>
        </section>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveEdit();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editor?.action === "add" ? "添加属性" : "编辑值"}
              </DialogTitle>
              <DialogDescription>
                {editor?.action === "add" ? "属性名称" : "节点值"}
              </DialogDescription>
            </DialogHeader>
            <Input
              className="my-4"
              aria-label={editor?.action === "add" ? "属性名称" : "节点值"}
              value={editor?.text ?? ""}
              onChange={(event) =>
                setEditor((previous) =>
                  previous ? { ...previous, text: event.target.value } : null,
                )
              }
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(null)}
              >
                取消
              </Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}
