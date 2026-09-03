import { describe, it, expect, vi } from "vitest";
import { significantPrefix, processInterestCodes, deadlineFallback } from "@/lib/services/recommend/recall";
import type { RowDataPacket } from "mysql2/promise";

describe("significantPrefix", () => {
  it("去除尾部 '00' 段", () => {
    expect(significantPrefix("12340000")).toBe("1234");
    expect(significantPrefix("12000000")).toBe("12");
  });
  it("无尾部 '00' → 原样返回", () => {
    expect(significantPrefix("12345678")).toBe("12345678");
  });
  it("空码 → 空字符串", () => {
    expect(significantPrefix("")).toBe("");
  });
});

describe("processInterestCodes", () => {
  const depthFactor = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.0 };

  it("空行 → 空结果", () => {
    const result = processInterestCodes([], depthFactor);
    expect(result.scoredCodes).toEqual([]);
    expect(result.interestTotal).toBe(0);
  });

  it("有效兴趣码行 → 生成加权前缀", () => {
    const rows = [{ level: 2, code: "12345678", code_id: 100, decayed_weight: 3.0 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.scoredCodes.length).toBe(1);
    expect(result.interestTotal).toBe(3.0);
  });

  it("decayed_weight ≤ 0 → 跳过", () => {
    const rows = [{ level: 2, code: "12345678", code_id: 100, decayed_weight: 0 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.scoredCodes).toEqual([]);
  });
});

describe("deadlineFallback", () => {
  it("返回降级结果结构", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 5 }]])  // COUNT 查询
        .mockResolvedValueOnce([                    // 数据查询
          [{ id: 1, notice_id: "N1", title: "Test", notice_type: "ITB", country: "China",
             deadline_sec: 9999999999, description: "desc", documents: "[]", procurement_files: "[]" }],
        ]),
    };
    const result = await deadlineFallback(mockPool as any, 1, 10, 0);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.fallback).toBe("deadline");
    expect(result.items).toHaveLength(1);
  });
});
