export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function normalizeGridSize(value: string | undefined, fallback = 2): number {
  return clamp(Math.round(Number(value) || fallback), 1, 10);
}

export function calculateOutputSize(
  width: number,
  height: number,
  requestedWidth: number,
): { width: number; height: number } {
  const outputWidth = Math.max(1, Math.round(Math.min(requestedWidth || width, width)));
  const outputHeight = Math.max(1, Math.round((height / width) * outputWidth));
  return { width: outputWidth, height: outputHeight };
}

export function calculateSliceRegion(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  columns: number,
  row: number,
  column: number,
): ImageRegion {
  const top = Math.round((imageHeight * row) / rows);
  const bottom = Math.round((imageHeight * (row + 1)) / rows);
  const left = Math.round((imageWidth * column) / columns);
  const right = Math.round((imageWidth * (column + 1)) / columns);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function imageExtension(mime: string): string {
  return mime === "image/jpeg" ? "jpg" : mime.split("/")[1] ?? "image";
}

export function fileStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, "") || "image";
}
