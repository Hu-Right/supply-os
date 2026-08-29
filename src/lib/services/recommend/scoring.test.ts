import { describe, it, expect } from "vitest";
import { buildScoringContext, resolveWeights } from "./scoring";
import type { RecallResult } from "./recall";

describe("buildScoringContext", () => {
  it("空 scoredCodes → matchWeightExpr='0'", () => {
    const ctx = buildScoringContext([], 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.matchWeightExpr).toBe("0");
    expect(ctx.scoreParams).toEqual([]);
  });

  it("有 scoredCodes → 生成 LIKE 表达式", () => {
    const codes: RecallResult[] = [
      { prefix: "1234", weighted: 2.5 },
      { prefix: "5678", weighted: 1.5 },
    ];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.matchWeightExpr).toContain("LIKE");
    expect(ctx.scoreParams).toEqual(["1234%", 2.5, "5678%", 1.5]);
  });

  it("denominator = interestTotal > 0 时使用 interestTotal", () => {
    const ctx = buildScoringContext([], 20, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.denominator).toBe(20);
  });

  it("denominator = 1 当 interestTotal = 0（防除零）", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.denominator).toBe(1);
  });

  it("amountActive=false → amountExpr='0.5'", () => {
    const ctx = buildScoringContext([], 10, 0.5, 0.15, 0.1, 0.05, 3, false);
    expect(ctx.amountExpr).toBe("0.5");
    expect(ctx.amountScoreParams).toEqual([]);
  });

  it("amountActive=true → amountExpr 含 LOG10", () => {
    const ctx = buildScoringContext([], 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.amountExpr).toContain("LOG10");
    expect(ctx.amountScoreParams).toEqual([3]);
  });

  it("L4 前缀（≥8 字符）→ l4HitExpr 生成", () => {
    const codes: RecallResult[] = [{ prefix: "12345678", weighted: 1 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.l4HitExpr).toContain("LIKE");
    expect(ctx.l4Params).toEqual(["12345678%"]);
  });

  it("短前缀（<8 字符）→ l4HitExpr='0'", () => {
    const codes: RecallResult[] = [{ prefix: "1234", weighted: 1 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.l4HitExpr).toBe("0");
    expect(ctx.l4Params).toEqual([]);
  });
});

describe("resolveWeights", () => {
  it("control 变体 → 忽略 profileRow，使用全局默认", () => {
    const result = resolveWeights({ w_unspsc: 0.8, w_urgency: 0.1, w_amount: 0.05, w_agency: 0.2, w_geo: 0.15, updated_at: new Date() } as any, "control");
    expect(result.wUnspsc).toBe(0.5);
    expect(result.wUrgency).toBe(0.15);
  });

  it("treatment 变体 + 有效 profile → 使用 profile 权重", () => {
    const row = { w_unspsc: 0.6, w_urgency: 0.12, w_amount: 0.08, w_agency: 0.1, w_geo: 0.1, updated_at: new Date() } as any;
    const result = resolveWeights(row, "treatment");
    expect(result.wUnspsc).toBe(0.6);
    expect(result.wUrgency).toBe(0.12);
    expect(result.wAmount).toBe(0.08);
  });

  it("无效权重值 → 回退默认", () => {
    const row = { w_unspsc: -1, w_urgency: 2, w_amount: 0, w_agency: null, w_geo: null, updated_at: new Date() } as any;
    const result = resolveWeights(row, "treatment");
    expect(result.wUnspsc).toBe(0.5);
    expect(result.wUrgency).toBe(0.15);
    expect(result.wAmount).toBe(0.1);
  });

  it("profileStale: 无 profileRow → true", () => {
    const result = resolveWeights(null, "treatment");
    expect(result.profileStale).toBe(true);
  });

  it("profileStale: updated_at > 24h 前 → true", () => {
    const row = { w_unspsc: 0.5, updated_at: new Date(Date.now() - 48 * 3600 * 1000) } as any;
    const result = resolveWeights(row, "treatment");
    expect(result.profileStale).toBe(true);
  });

  it("profileStale: updated_at 新鲜 → false", () => {
    const row = { w_unspsc: 0.5, updated_at: new Date() } as any;
    const result = resolveWeights(row, "treatment");
    expect(result.profileStale).toBe(false);
  });
});
