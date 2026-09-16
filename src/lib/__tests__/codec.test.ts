import { describe, expect, it } from "vitest";
import { base64Decode, base64Encode, jwtDecode, urlDecode, urlEncode } from "../codec";

describe("base64", () => {
  it("round-trips ascii", () => {
    expect(base64Encode("hello")).toBe("aGVsbG8=");
    expect(base64Decode("aGVsbG8=")).toBe("hello");
  });

  it("round-trips utf-8 correctly", () => {
    const text = "你好，世界 🌍";
    expect(base64Decode(base64Encode(text))).toBe(text);
  });

  it("matches the RFC 4648 utf-8 example", () => {
    expect(base64Encode("foobar")).toBe("Zm9vYmFy");
  });
});

describe("url codec", () => {
  it("encodes and decodes reserved characters", () => {
    expect(urlEncode("a b&c=d/é")).toBe("a%20b%26c%3Dd%2F%C3%A9");
    expect(urlDecode("a%20b%26c%3Dd%2F%C3%A9")).toBe("a b&c=d/é");
  });
});

describe("jwtDecode", () => {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Im5lcmkifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  it("decodes header and payload", () => {
    const parts = jwtDecode(token);
    expect(parts.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(parts.payload).toEqual({ sub: "1234567890", name: "neri" });
    expect(parts.signature).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });

  it("rejects malformed tokens", () => {
    expect(() => jwtDecode("only.two")).toThrow(/三段/);
    expect(() => jwtDecode("a.b.c")).toThrow(/base64url/);
    expect(() => jwtDecode("")).toThrow(/三段/);
  });
});
