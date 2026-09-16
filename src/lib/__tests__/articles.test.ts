import { describe, expect, it } from "vitest";
import { readingMinutes } from "../articles";

describe("readingMinutes", () => {
  it("counts CJK characters at 300 per minute", () => {
    expect(readingMinutes("一".repeat(300))).toBe(1);
    expect(readingMinutes("一".repeat(301))).toBe(2);
    expect(readingMinutes("一".repeat(900))).toBe(3);
  });

  it("counts latin words at 200 per minute", () => {
    expect(readingMinutes("word ".repeat(200).trim())).toBe(1);
    expect(readingMinutes("word ".repeat(201).trim())).toBe(2);
  });

  it("mixes both scripts", () => {
    expect(readingMinutes(`${"一".repeat(150)} ${"word ".repeat(100).trim()}`)).toBe(1);
  });

  it("returns at least one minute", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("短句")).toBe(1);
  });
});
