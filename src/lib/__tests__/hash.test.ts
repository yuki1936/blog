import { describe, expect, it } from "vitest";
import { digestHex, encodeText, toHex } from "../hash";

describe("digestHex", () => {
  it("matches known SHA vectors for the empty string", async () => {
    expect(await digestHex("SHA-1", new Uint8Array())).toBe(
      "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    );
    expect(await digestHex("SHA-256", new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await digestHex("SHA-512", new Uint8Array())).toBe(
      "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
    );
  });

  it("matches known SHA-256 vectors for text input", async () => {
    expect(await digestHex("SHA-256", encodeText("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await digestHex("SHA-256", encodeText("中文"))).toHaveLength(64);
  });
});

describe("toHex", () => {
  it("formats bytes as lowercase hex", () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]).buffer)).toBe("00010f10ff");
  });
});
