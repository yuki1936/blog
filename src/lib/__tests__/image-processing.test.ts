import { describe, expect, test } from "vitest";
import {
  calculateOutputSize,
  calculateSliceRegion,
  clamp,
  fileStem,
  formatBytes,
  imageExtension,
  normalizeGridSize,
} from "../image-processing";

describe("image processing helpers", () => {
  test("clamps values and normalizes grid dimensions", () => {
    expect(clamp(-2, 1, 10)).toBe(1);
    expect(clamp(12, 1, 10)).toBe(10);
    expect(normalizeGridSize(undefined)).toBe(2);
    expect(normalizeGridSize("3.6")).toBe(4);
    expect(normalizeGridSize("20")).toBe(10);
  });

  test("formats byte sizes at stable unit boundaries", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.50 MB");
  });

  test("preserves aspect ratio and never enlarges an output", () => {
    expect(calculateOutputSize(4000, 3000, 1000)).toEqual({
      width: 1000,
      height: 750,
    });
    expect(calculateOutputSize(400, 300, 1200)).toEqual({
      width: 400,
      height: 300,
    });
    expect(calculateOutputSize(400, 300, 0)).toEqual({
      width: 400,
      height: 300,
    });
  });

  test("covers uneven grids without gaps or lost edge pixels", () => {
    const regions = Array.from({ length: 3 }, (_, column) =>
      calculateSliceRegion(10, 7, 2, 3, 0, column),
    );

    expect(regions).toEqual([
      { x: 0, y: 0, width: 3, height: 4 },
      { x: 3, y: 0, width: 4, height: 4 },
      { x: 7, y: 0, width: 3, height: 4 },
    ]);
    expect(regions.reduce((total, region) => total + region.width, 0)).toBe(10);
    expect(calculateSliceRegion(10, 7, 2, 3, 1, 2)).toEqual({
      x: 7,
      y: 4,
      width: 3,
      height: 3,
    });
  });

  test("derives safe output extensions and filename stems", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
    expect(fileStem("photo.final.png")).toBe("photo.final");
    expect(fileStem(".png")).toBe("image");
  });
});
