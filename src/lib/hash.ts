export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export const hashAlgorithms: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

/** 把字节摘要格式化为小写十六进制。 */
export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 用 WebCrypto 计算摘要，返回小写十六进制。仅在本地完成，不上传任何数据。 */
export async function digestHex(algorithm: HashAlgorithm, data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest(algorithm, data as BufferSource);
  return toHex(buffer);
}

export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
