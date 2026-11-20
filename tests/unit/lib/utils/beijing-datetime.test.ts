/**
 * 北京墙钟工具单测：beijingDatetimeToMs 必须自己站得住
 *
 * @description 钉死时区口径：墙钟串 → epoch 显式按 UTC+8 折算，不经 Date.parse
 *              （它按进程/浏览器本地时区解释，出海用户或 UTC 容器会漂 8 小时）。
 *              2026-11-20 认领过期红横幅误报事故的回归锚：GET /api/supplier-claims
 *              曾把墙钟串原样透传，前端 Number()=NaN 全程误判「认领已过期」。
 */
import { describe, it, expect } from "vitest";
import {
  formatBeijingDatetime,
  beijingDatetimeAfter,
  beijingDatetimeToMs,
} from "@/lib/utils/beijing-datetime";

describe("beijingDatetimeToMs — 北京墙钟串 → epoch 毫秒", () => {
  it("显式向量：按 UTC+8 折算，与 Date.parse(+08:00) 同值", () => {
    expect(beijingDatetimeToMs("2026-10-08 11:47:10")).toBe(Date.parse("2026-10-08T11:47:10+08:00"));
    expect(beijingDatetimeToMs("2026-11-20 10:47:10")).toBe(Date.parse("2026-11-20T10:47:10+08:00"));
  });

  it("UTC 边界：北京 2026-01-01 00:00:00 = 前一日 16:00Z", () => {
    expect(beijingDatetimeToMs("2026-01-01 00:00:00")).toBe(Date.UTC(2025, 11, 31, 16, 0, 0));
  });

  it("roundtrip：formatBeijingDatetime → toMs 还原同一时刻（墙钟串无毫秒，取整秒）", () => {
    for (const seed of [0, 1763574430123, 1799999999999]) {
      expect(beijingDatetimeToMs(formatBeijingDatetime(new Date(seed)))).toBe(
        Math.floor(seed / 1000) * 1000,
      );
    }
  });

  it("ISO 风格 T 分隔符兼容", () => {
    expect(beijingDatetimeToMs("2026-10-08T11:47:10")).toBe(Date.parse("2026-10-08T11:47:10+08:00"));
  });

  it("非法输入一律 NaN：空串/日期-only/缺秒/垃圾串/null/undefined", () => {
    expect(beijingDatetimeToMs("")).toBeNaN();
    expect(beijingDatetimeToMs("2026-10-08")).toBeNaN();
    expect(beijingDatetimeToMs("2026-10-08 11:47")).toBeNaN();
    expect(beijingDatetimeToMs("not-a-date")).toBeNaN();
    expect(beijingDatetimeToMs(null)).toBeNaN();
    expect(beijingDatetimeToMs(undefined)).toBeNaN();
  });
});

describe("beijingDatetimeAfter — 相对到期串", () => {
  it("+1h 的串解析回 epoch 恰为 now+1h（容差 ±1s），写读双向闭环", () => {
    const before = Date.now();
    const ms = beijingDatetimeToMs(beijingDatetimeAfter(3600_000));
    expect(ms).toBeGreaterThanOrEqual(before + 3600_000 - 1000);
    expect(ms).toBeLessThanOrEqual(Date.now() + 3600_000 + 1000);
  });
});
