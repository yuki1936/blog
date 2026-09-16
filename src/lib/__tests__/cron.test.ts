import { describe, expect, it } from "vitest";
import { describeCron } from "../cron";

describe("describeCron", () => {
  it("describes wildcard fields", () => {
    expect(describeCron("* * * * *")).toBe("每分钟，每小时，每日，每月，每星期");
  });

  it("describes step values", () => {
    expect(describeCron("*/5 * * * *")).toBe("每 5 分钟，每小时，每日，每月，每星期");
    expect(describeCron("0 */2 * * *")).toBe("分钟为 0，每 2 小时，每日，每月，每星期");
  });

  it("describes fixed values, ranges, and lists", () => {
    expect(describeCron("30 1 * * *")).toContain("分钟为 30");
    expect(describeCron("0 9-17 * * 1-5")).toContain("小时为 9 到 17");
    expect(describeCron("0 0 1 1,7 *")).toContain("月为 1、7");
    expect(describeCron("0,30 * * * *")).toContain("分钟为 0、30");
  });

  it("maps 7 to sunday like 0", () => {
    expect(describeCron("0 0 * * 7")).toBe("分钟为 0，小时为 0，每日，每月，星期为 0");
  });

  it("expands aliases", () => {
    expect(describeCron("@hourly")).toBe(describeCron("0 * * * *"));
    expect(describeCron("@daily")).toBe(describeCron("0 0 * * *"));
  });

  it("rejects invalid expressions", () => {
    expect(() => describeCron("* * * *")).toThrow(/5 个字段/);
    expect(() => describeCron("60 * * * *")).toThrow(/超出范围/);
    expect(() => describeCron("*/0 * * * *")).toThrow(/步长/);
    expect(() => describeCron("0 17-9 * * *")).toThrow(/起点大于终点/);
  });
});
