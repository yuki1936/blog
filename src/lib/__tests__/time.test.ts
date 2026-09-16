import { describe, expect, it } from "vitest";
import { formatDateTime, parseTimestamp } from "../time";

describe("parseTimestamp", () => {
  it("treats up to 10 digits as seconds", () => {
    expect(parseTimestamp("0")).toBe(0);
    expect(parseTimestamp("1757894400")).toBe(1757894400 * 1000);
  });

  it("treats 11-13 digits as milliseconds", () => {
    expect(parseTimestamp("1757894400000")).toBe(1757894400000);
  });

  it("rejects non-numeric or oversized input", () => {
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("12345678901234")).toBeNull();
    expect(parseTimestamp("-1")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("formats a known instant in UTC", () => {
    expect(formatDateTime(Date.UTC(2026, 8, 15, 1, 2, 3), "UTC")).toBe("2026-09-15 01:02:03");
  });

  it("formats midnight in Shanghai", () => {
    expect(formatDateTime(Date.UTC(2026, 0, 1, 16, 0, 0), "Asia/Shanghai")).toBe(
      "2026-01-02 00:00:00",
    );
  });
});
