/** 把时间戳解析为毫秒。10 位按秒、13 位按毫秒自动识别，非法返回 null。 */
export function parseTimestamp(input: string): number | null {
  if (!/^\d{1,13}$/.test(input.trim())) return null;
  const value = Number(input.trim());
  if (input.trim().length <= 10) return value * 1000;
  return value;
}

/** 格式化为 `YYYY-MM-DD HH:mm:ss`（指定时区，如 "UTC" 或 "Asia/Shanghai"）。 */
export function formatDateTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(ms)).replace(/\//g, "-");
}
