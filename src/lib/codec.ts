/** UTF-8 安全的 Base64 编解码（btoa/atob 只支持 Latin1，必须经字节中转）。 */
export function base64Encode(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64Decode(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function urlEncode(text: string): string {
  return encodeURIComponent(text);
}

export function urlDecode(encoded: string): string {
  return decodeURIComponent(encoded);
}

export interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** 原样保留的 base64url 签名段，仅展示，不校验。 */
  signature: string;
}

function decodeBase64Url(segment: string): string {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "=").padEnd(
    Math.ceil(segment.length / 4) * 4,
    "=",
  );
  try {
    return base64Decode(padded);
  } catch {
    throw new Error("header 或 payload 不是合法的 base64url 编码");
  }
}

/** 解码 JWT 的三段结构。只在本地解析展示，不验证签名。 */
export function jwtDecode(token: string): JwtParts {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error("JWT 应为 header.payload.signature 三段点分结构");
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts[0])) as Record<string, unknown>;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    return { header, payload, signature: parts[2] };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("header 或 payload 不是合法的 JSON");
    throw error;
  }
}
