export interface CidrInfo {
  input: string;
  prefix: number;
  network: string;
  broadcast: string;
  netmask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  /** 可用主机数（/31 视为 2，/32 视为 1）。 */
  totalHosts: number;
}

/** 解析点分十进制 IPv4 为 uint32，非法返回 null。 */
export function parseIpv4(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

export function formatIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

/** 解析 192.168.1.10/24 形式的 CIDR，非法输入抛出中文错误。 */
export function cidrInfo(input: string): CidrInfo {
  const [ip, prefixText] = input.trim().split("/");
  const address = parseIpv4(ip ?? "");
  if (address === null) throw new Error("IPv4 地址格式不正确");
  if (prefixText === undefined || !/^\d{1,2}$/.test(prefixText)) {
    throw new Error("前缀长度应为 0-32 的数字");
  }
  const prefix = Number(prefixText);
  if (prefix > 32) throw new Error("前缀长度应为 0-32 的数字");

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const usable = prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
  const firstHost = prefix >= 31 ? network : network + 1;
  const lastHost = prefix >= 31 ? broadcast : broadcast - 1;

  return {
    input: input.trim(),
    prefix,
    network: formatIpv4(network),
    broadcast: formatIpv4(broadcast),
    netmask: formatIpv4(mask),
    wildcard: formatIpv4(~mask >>> 0),
    firstHost: formatIpv4(firstHost >>> 0),
    lastHost: formatIpv4(lastHost >>> 0),
    totalHosts: usable,
  };
}
