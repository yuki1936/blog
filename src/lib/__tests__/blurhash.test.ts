import { describe, expect, test } from "vitest";
import {
  BlurHashError,
  decode,
  decodeBase83,
  encode,
  encodeBase83,
} from "../blurhash";

describe("Base83", () => {
  test("round-trips values", () => {
    for (const value of [0, 1, 82, 83, 6888]) {
      const encoded = encodeBase83(value, 3);
      expect(decodeBase83(encoded)).toBe(value);
    }
  });

  test("rejects invalid values and characters", () => {
    expect(() => encodeBase83(-1, 2)).toThrow(BlurHashError);
    expect(() => encodeBase83(83, 1)).toThrow("value does not fit");
    expect(() => decodeBase83("!")).toThrow("invalid Base83 character");
  });
});

describe("BlurHash", () => {
  const rgbaFixture = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);

  test("encodes a fixed RGBA fixture deterministically", () => {
    expect(encode(rgbaFixture, 2, 2, 2, 2)).toBe("A~Lqe9|l~h|c");
  });

  test("decodes the standard sample to stable RGBA pixels", () => {
    expect(Array.from(decode("LEHV6nWB2yk8pyo0adR*.7kCMdnj", 2, 2))).toEqual([
      135, 164, 177, 255,
      181, 180, 171, 255,
      120, 148, 162, 255,
      158, 125, 108, 255,
    ]);
  });

  test("validates dimensions, components, pixel buffers, hash length, and punch", () => {
    expect(() => encode(rgbaFixture, 0, 2, 2, 2)).toThrow("positive safe integers");
    expect(() => encode(rgbaFixture, 2, 2, 10, 2)).toThrow("range 1..=9");
    expect(() => encode(new Uint8Array(3), 2, 2, 2, 2)).toThrow(
      "pixel data length",
    );
    expect(() => decode("short", 2, 2)).toThrow("expected at least 6");
    expect(() => decode("LEHV6nWB2yk8pyo0adR*.7kCMdnj", 2, 2, -1)).toThrow(
      "finite and non-negative",
    );
  });
});
