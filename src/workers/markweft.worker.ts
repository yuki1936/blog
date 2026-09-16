import type {
  ConversionDiagnostic,
  ConversionOptions,
  FormatName,
  MarkweftWorkerRequest,
  MarkweftWorkerResponse,
} from "../lib/markup-converter";

interface MarkweftModule {
  default: (options: { module_or_path: URL }) => Promise<unknown>;
  detectFormatDetails: (source: string) => string;
  convertDocumentWithReport: (
    source: string,
    from: FormatName,
    to: FormatName,
    options: string,
  ) => string;
}

const workerScope = self as unknown as {
  postMessage: (message: MarkweftWorkerResponse) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<MarkweftWorkerRequest>) => void,
  ) => void;
};

let modulePromise: Promise<MarkweftModule> | undefined;

function loadMarkweft(): Promise<MarkweftModule> {
  modulePromise ??= (async () => {
    const moduleResponse = await fetch("/wasm/markweft/markweft.js");
    if (!moduleResponse.ok) {
      throw new Error(`Unable to load markweft module: HTTP ${moduleResponse.status}`);
    }

    const blobUrl = URL.createObjectURL(new Blob(
      [await moduleResponse.text()],
      { type: "text/javascript" },
    ));
    try {
      const markweft = await import(/* @vite-ignore */ blobUrl) as MarkweftModule;
      await markweft.default({
        module_or_path: new URL("/wasm/markweft/markweft_bg.wasm", self.location.origin),
      });
      return markweft;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  })();
  return modulePromise;
}

workerScope.addEventListener("message", async ({ data }) => {
  try {
    const markweft = await loadMarkweft();
    if (data.type === "init") {
      workerScope.postMessage({ type: "ready" });
      return;
    }

    const detection = JSON.parse(markweft.detectFormatDetails(data.source)) as {
      format: FormatName;
      confidence: number;
    };
    const detectedFormat = data.from === "auto" ? detection.format : data.from;
    const report = JSON.parse(markweft.convertDocumentWithReport(
      data.source,
      detectedFormat,
      data.to,
      JSON.stringify(data.options),
    )) as {
      output: string;
      document: unknown;
      diagnostics: ConversionDiagnostic[];
    };
    const output = report.output;
    let previewHtml = data.to === "html" ? output : "";
    if (!previewHtml) {
      try {
        const previewOptions: ConversionOptions = {
          ...data.options,
          mode: "compatible",
          full_html_document: false,
        };
        const previewReport = JSON.parse(markweft.convertDocumentWithReport(
          data.source,
          detectedFormat,
          "html",
          JSON.stringify(previewOptions),
        )) as { output: string };
        previewHtml = previewReport.output;
      } catch {
        // A preview is optional; keep a successful source conversion usable.
      }
    }
    workerScope.postMessage({
      type: "result",
      id: data.id,
      output,
      previewHtml,
      astJson: JSON.stringify(report.document, null, 2),
      diagnostics: report.diagnostics,
      detectedFormat,
      confidence: detection.confidence,
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      id: data.type === "convert" ? data.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
