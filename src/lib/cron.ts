const cronAliases: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

interface CronField {
  name: string;
  unit: string;
  range: readonly [number, number];
  /** 星期字段允许 0-7（0 和 7 都是周日）。 */
  names?: Record<string, number>;
}

const cronFields: CronField[] = [
  { name: "分钟", unit: "分钟", range: [0, 59] },
  { name: "小时", unit: "小时", range: [0, 23] },
  { name: "日", unit: "日", range: [1, 31] },
  { name: "月", unit: "月", range: [1, 12] },
  {
    name: "星期",
    unit: "天",
    range: [0, 7],
    names: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 },
  },
];

function normalizeValue(raw: string, field: CronField): number {
  const value = field.names?.[raw.toLowerCase()] ?? Number(raw);
  if (!Number.isInteger(value) || value < field.range[0] || value > field.range[1]) {
    throw new Error(`${field.name}字段的值 "${raw}" 超出范围 ${field.range[0]}-${field.range[1]}`);
  }
  return value === 7 && field.name === "星期" ? 0 : value;
}

function describePart(part: string, field: CronField): string {
  const stepSplit = part.split("/");
  const step = stepSplit.length === 2 ? Number(stepSplit[1]) : 1;
  if (!Number.isInteger(step) || step < 1) throw new Error(`步长应为正整数： "${part}"`);
  const selector = stepSplit[0];

  if (selector === "*") {
    return step === 1 ? `每${field.name}` : `每 ${step} ${field.unit}`;
  }
  if (selector.includes("-")) {
    const [start, end] = selector.split("-");
    const from = normalizeValue(start, field);
    const to = normalizeValue(end, field);
    if (from > to) throw new Error(`${field.name}字段的区间 ${selector} 起点大于终点`);
    const stepSuffix = step === 1 ? "" : `，每 ${step} ${field.unit}`;
    return `${field.name}为 ${from} 到 ${to}${stepSuffix}`;
  }
  const values = selector.split(",").map((value) => normalizeValue(value, field));
  const unique = [...new Set(values)].sort((a, b) => a - b);
  return `${field.name}为 ${unique.join("、")}`;
}

/** 把 5 字段 Cron 表达式翻译成中文描述，非法表达式抛出错误。 */
export function describeCron(expression: string): string {
  const trimmed = expression.trim();
  const expanded = cronAliases[trimmed] ?? trimmed;
  const parts = expanded.split(/\s+/);
  if (parts.length !== 5) throw new Error("表达式应为 5 个字段： 分 时 日 月 星期");
  return cronFields.map((field, index) => describePart(parts[index], field)).join("，");
}
