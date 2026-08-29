import { describe, it, expect } from "vitest";
import { significantPrefix, processInterestCodes } from "./recall";
import type { RowDataPacket } from "mysql2/promise";

describe("significantPrefix", () => {
  it("去除尾部 '00' 段", () => {
    expect(significantPrefix("12340000")).toBe("1234");
    expect(significantPrefix("12000000")).toBe("12");
  });

  it("无尾部 '00' → 原样返回", () => {
    expect(significantPrefix("12345678")).toBe("12345678");
    expect(significantPrefix("1234")).toBe("1234");
  });

  it("奇数长度码不处理", () => {
    expect(significantPrefix("12345")).toBe("12345");
  });

  it("2 位码 → 不继续截断", () => {
    expect(significantPrefix("12")).toBe("12");
    expect(significantPrefix("00")).toBe("00");
  });

  it("多级尾部 00 连续截断", () => {
    expect(significantPrefix("12000000")).toBe("12");
  });
});

describe("processInterestCodes", () => {
  const depthFactor = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.0 };

  it("空行 → 空结果", () => {
    const result = processInterestCodes([], depthFactor);
    expect(result.scoredCodes).toEqual([]);
    expect(result.clauses.bridgeWhere).toBe("");
    expect(result.interestTotal).toBe(0);
  });

  it("有效兴趣码行 → 生成加权前缀", () => {
    const rows = [{ level: 2, code: "12345678", code_id: 100, decayed_weight: 3.0 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.scoredCodes.length).toBe(1);
    expect(result.scoredCodes[0].prefix).toBe("12345678");
    expect(result.interestTotal).toBe(3.0);
  });

  it("decayed_weight ≤ 0 → 跳过", () => {
    const rows = [{ level: 2, code: "12345678", code_id: 100, decayed_weight: 0 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.scoredCodes).toEqual([]);
    expect(result.interestTotal).toBe(0);
  });

  it("level ≥ 2 + code_id > 0 → IN 子句", () => {
    const rows = [{ level: 3, code: "12345678", code_id: 200, decayed_weight: 2.0 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.clauses.bridgeWhere).toContain("b.level3_id IN");
    expect(result.clauses.params).toContain(200);
  });

  it("level ≥ 2 + code_id = 0 + 前缀 ≥ 4 → LIKE 子句", () => {
    const rows = [{ level: 2, code: "12345678", code_id: 0, decayed_weight: 1.5 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.clauses.bridgeWhere).toContain("b.code LIKE");
  });

  it("多行 → interestTotal 累加", () => {
    const rows = [
      { level: 2, code: "1234", code_id: 1, decayed_weight: 1.0 },
      { level: 3, code: "5678", code_id: 2, decayed_weight: 2.0 },
    ] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.interestTotal).toBeCloseTo(3.0);
  });

  it("空 code → 跳过", () => {
    const rows = [{ level: 2, code: "", code_id: 1, decayed_weight: 1.0 }] as RowDataPacket[];
    const result = processInterestCodes(rows, depthFactor);
    expect(result.scoredCodes).toEqual([]);
  });
});
