import { describe, it, expect, vi } from "vitest";
import { buildScoringContext, resolveWeights, getAmountPreference } from "./scoring";
import type { RecallResult } from "./recall";

describe("buildScoringContext", () => {
  it("空 scoredCodes → matchWeightExpr='0'", () => {
    const ctx = buildScoringContext([], 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.matchWeightExpr).toBe("0");
  });

  it("有 scoredCodes → 生成 LIKE 表达式", () => {
    const codes: RecallResult[] = [{ prefix: "1234", weighted: 2.5 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.matchWeightExpr).toContain("LIKE");
    expect(ctx.scoreParams).toEqual(["1234%", 2.5]);
  });

  it("denominator = interestTotal > 0", () => {
    const ctx = buildScoringContext([], 20, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.denominator).toBe(20);
  });

  it("denominator = 1 当 interestTotal = 0", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.denominator).toBe(1);
  });

  it("含 L4 长前缀（≥8 位）→ 生成 l4 OR-LIKE 表达式与参数", () => {
    const codes: RecallResult[] = [
      { prefix: "12345678", weighted: 1.0 },
      { prefix: "99", weighted: 0.5 },
    ];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.l4HitExpr).toContain("b.code LIKE ?");
    expect(ctx.l4Params).toEqual(["12345678%"]);
  });

  it("全部短前缀（<8 位）→ l4HitExpr 恒为 0", () => {
    const codes: RecallResult[] = [{ prefix: "99", weighted: 0.5 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.l4HitExpr).toBe("0");
    expect(ctx.l4Params).toEqual([]);
  });
});

describe("resolveWeights", () => {
  it("control 变体 → 全局默认", () => {
    const result = resolveWeights({ w_unspsc: 0.8 } as any, "control");
    expect(result.wUnspsc).toBe(0.5);
  });

  it("treatment + 有效 profile → 使用 profile", () => {
    const row = { w_unspsc: 0.6, w_urgency: 0.12, w_amount: 0.08, w_agency: 0.1, w_geo: 0.1, updated_at: new Date() } as any;
    const result = resolveWeights(row, "treatment");
    expect(result.wUnspsc).toBe(0.6);
  });

  it("profileStale: 无 profileRow → true", () => {
    expect(resolveWeights(null, "treatment").profileStale).toBe(true);
  });
});

describe("getAmountPreference", () => {
  it("DB 返回有效数据 → centerLog + active", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ center_log: 3.5, cnt: 5 }]]),
    };
    const result = await getAmountPreference(mockPool as any, 1);
    expect(result.centerLog).toBe(3.5);
    expect(result.active).toBe(true);
  });

  it("DB 返回 cnt < 2 → active=false", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ center_log: 0, cnt: 1 }]]),
    };
    const result = await getAmountPreference(mockPool as any, 2);
    expect(result.active).toBe(false);
  });

  it("TTL 内重复查询 → 命中缓存不再触达 DB", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ center_log: 2.5, cnt: 3 }]]),
    };
    await getAmountPreference(mockPool as any, 99);
    await getAmountPreference(mockPool as any, 99);
    await getAmountPreference(mockPool as any, 99);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(await getAmountPreference(mockPool as any, 99)).toEqual({ centerLog: 2.5, active: true });
  });
});
