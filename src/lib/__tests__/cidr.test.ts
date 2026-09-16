import { describe, expect, it } from "vitest";
import { cidrInfo, formatIpv4, parseIpv4 } from "../cidr";

describe("parseIpv4", () => {
  it("parses valid addresses to uint32", () => {
    expect(parseIpv4("0.0.0.0")).toBe(0);
    expect(parseIpv4("192.168.1.10")).toBe(0xc0a8010a);
    expect(parseIpv4("255.255.255.255")).toBe(0xffffffff);
  });

  it("rejects invalid input", () => {
    expect(parseIpv4("256.1.1.1")).toBeNull();
    expect(parseIpv4("1.2.3")).toBeNull();
    expect(parseIpv4("a.b.c.d")).toBeNull();
    expect(parseIpv4("")).toBeNull();
  });
});

describe("formatIpv4", () => {
  it("formats uint32 back to dotted quad", () => {
    expect(formatIpv4(0xc0a8010a)).toBe("192.168.1.10");
    expect(formatIpv4(0)).toBe("0.0.0.0");
  });
});

describe("cidrInfo", () => {
  it("computes classic /24 values", () => {
    expect(cidrInfo("192.168.1.10/24")).toEqual({
      input: "192.168.1.10/24",
      prefix: 24,
      network: "192.168.1.0",
      broadcast: "192.168.1.255",
      netmask: "255.255.255.0",
      wildcard: "0.0.0.255",
      firstHost: "192.168.1.1",
      lastHost: "192.168.1.254",
      totalHosts: 254,
    });
  });

  it("handles edge prefixes", () => {
    const tiny = cidrInfo("10.0.0.0/30");
    expect(tiny).toMatchObject({ totalHosts: 2, firstHost: "10.0.0.1", lastHost: "10.0.0.2" });
    const link = cidrInfo("10.0.0.4/31");
    expect(link).toMatchObject({ totalHosts: 2, firstHost: "10.0.0.4", lastHost: "10.0.0.5" });
    const host = cidrInfo("10.0.0.9/32");
    expect(host).toMatchObject({ totalHosts: 1, firstHost: "10.0.0.9", lastHost: "10.0.0.9" });
    const all = cidrInfo("0.0.0.0/0");
    expect(all).toMatchObject({ netmask: "0.0.0.0", broadcast: "255.255.255.255", totalHosts: 2 ** 32 - 2 });
  });

  it("throws descriptive errors", () => {
    expect(() => cidrInfo("192.168.1.1/33")).toThrow(/0-32/);
    expect(() => cidrInfo("192.168.1.256/24")).toThrow(/格式/);
    expect(() => cidrInfo("192.168.1.1")).toThrow(/前缀/);
  });
});
