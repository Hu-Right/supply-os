/**
 * server/services/recommend/ 补充测试
 * 覆盖 ab-testing (fnv1a32, recoVariant), recall (significantPrefix, processInterestCodes),
 * text-similarity (getUserUnlockKeywords), scoring (buildScoringContext, resolveWeights, getAmountPreference)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── ab-testing ──
import { recoVariant, AB_TREATMENT_PCT } from "../../../../server/services/recommend/ab-testing";

describe("recoVariant", () => {
  it("AB_TREATMENT_PCT=0 → 全部 control", () => {
    // 默认环境变量为 0
    expect(recoVariant("user1")).toBe("control");
    expect(recoVariant("user2")).toBe("control");
    expect(recoVariant("any-user")).toBe("control");
  });

  it("同一 userKey 多次调用返回相同结果（纯函数）", () => {
    const r1 = recoVariant("stable-user");
    const r2 = recoVariant("stable-user");
    expect(r1).toBe(r2);
  });

  it("不同 userKey 在默认配置下都是 control", () => {
    // 当 AB_TREATMENT_PCT=0 时，所有用户都是 control
    for (let i = 0; i < 100; i++) {
      expect(recoVariant(`user-${i}`)).toBe("control");
    }
  });

  it("AB_TREATMENT_PCT 值在 0-100 范围内", () => {
    expect(AB_TREATMENT_PCT).toBeGreaterThanOrEqual(0);
    expect(AB_TREATMENT_PCT).toBeLessThanOrEqual(100);
  });
});

// ── recall ──
import { significantPrefix, processInterestCodes } from "../../../../server/services/recommend/recall";

describe("significantPrefix", () => {
  it("尾部 '00' 被截断", () => {
    expect(significantPrefix("421400")).toBe("4214");
    expect(significantPrefix("420000")).toBe("42");
  });

  it("非 '00' 结尾不变", () => {
    expect(significantPrefix("4214")).toBe("4214");
    expect(significantPrefix("4213")).toBe("4213");
  });

  it("长度为 2 时不截断", () => {
    expect(significantPrefix("42")).toBe("42");
  });

  it("奇数长度不截断（非偶数对）", () => {
    expect(significantPrefix("421")).toBe("421");
  });

  it("连续截断：420000 → 42", () => {
    expect(significantPrefix("420000")).toBe("42");
  });
});

describe("processInterestCodes", () => {
  const depthFactor = { 1: 0.5, 2: 1.0, 3: 1.5, 4: 2.0 };

  it("空行 → 空结果", () => {
    const result = processInterestCodes([], depthFactor);
    expect(result.scoredCodes).toEqual([]);
    expect(result.clauses.bridgeWhere).toBe("");
    expect(result.interestTotal).toBe(0);
  });

  it("有效兴趣码 → 加权评分 + SQL 子句", () => {
    const rows = [
      { level: 4, code: "42140000", code_id: 42, decayed_weight: 10 },
    ];
    const result = processInterestCodes(rows as any, depthFactor);
    expect(result.scoredCodes.length).toBe(1);
    expect(result.interestTotal).toBe(10);
    expect(result.clauses.bridgeWhere).toContain("b.level4_id");
    expect(result.clauses.params).toContain(42);
  });

  it("decayed_weight <= 0 → 跳过", () => {
    const rows = [{ level: 3, code: "4214", code_id: 10, decayed_weight: 0 }];
    const result = processInterestCodes(rows as any, depthFactor);
    expect(result.scoredCodes).toEqual([]);
    expect(result.interestTotal).toBe(0);
  });

  it("code_id=0 + prefix>=4 → LIKE 前缀匹配", () => {
    const rows = [{ level: 3, code: "4214", code_id: 0, decayed_weight: 5 }];
    const result = processInterestCodes(rows as any, depthFactor);
    expect(result.clauses.bridgeWhere).toContain("b.code LIKE ?");
    expect(result.clauses.params).toContain("4214%");
  });

  it("level=1 → 不生成 recall 子句（level < 2）", () => {
    const rows = [{ level: 1, code: "42", code_id: 5, decayed_weight: 8 }];
    const result = processInterestCodes(rows as any, depthFactor);
    expect(result.interestTotal).toBe(8);
    expect(result.clauses.bridgeWhere).toBe("");
  });

  it("多码去重 → 同一 level 的 code_id 不重复", () => {
    const rows = [
      { level: 4, code: "42140000", code_id: 42, decayed_weight: 10 },
      { level: 4, code: "42140000", code_id: 42, decayed_weight: 5 },
    ];
    const result = processInterestCodes(rows as any, depthFactor);
    // code_id 42 只出现一次
    const count42 = result.clauses.params.filter((p: any) => p === 42).length;
    expect(count42).toBe(1);
  });
});

// ── text-similarity: getUserUnlockKeywords ──
import { getUserUnlockKeywords } from "../../../../server/services/recommend/text-similarity";

describe("getUserUnlockKeywords", () => {
  it("有历史记录 → 返回关键词集合", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[
        { title: "Medical Equipment Supply" },
        { title: "Healthcare Services Procurement" },
      ]]),
    };
    const keywords = await getUserUnlockKeywords(pool, "user1");
    expect(keywords).not.toBeNull();
    expect(keywords!.size).toBeGreaterThan(0);
    expect(keywords!.has("medical")).toBe(true);
  });

  it("无历史记录 → 返回 null", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[]]) };
    const keywords = await getUserUnlockKeywords(pool, "user-no-history");
    expect(keywords).toBeNull();
  });

  it("DB 异常 → 返回 null（降级）", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("DB error")) };
    const keywords = await getUserUnlockKeywords(pool, "user-error");
    expect(keywords).toBeNull();
  });

  it("缓存命中 → 不查询 DB", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ title: "Test" }]]) };
    await getUserUnlockKeywords(pool, "cached-user");
    const callCount1 = pool.query.mock.calls.length;
    await getUserUnlockKeywords(pool, "cached-user");
    expect(pool.query.mock.calls.length).toBe(callCount1); // 没有新查询
  });
});

// ── scoring ──
import { buildScoringContext, resolveWeights, getAmountPreference } from "../../../../server/services/recommend/scoring";

describe("buildScoringContext", () => {
  it("空 scoredCodes → matchWeightExpr=0", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.1, 5, false);
    expect(ctx.matchWeightExpr).toBe("0");
    expect(ctx.scoreParams).toEqual([]);
    expect(ctx.denominator).toBe(1); // interestTotal=0 → 回退 1
  });

  it("有 scoredCodes → 生成 LIKE 表达式", () => {
    const codes = [{ prefix: "4214", weighted: 10 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.1, 5, false);
    expect(ctx.matchWeightExpr).toContain("MAX(b.code LIKE ?)");
    expect(ctx.scoreParams).toEqual(["4214%", 10]);
    expect(ctx.denominator).toBe(10);
  });

  it("amountActive=false → amountExpr=0.5", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.1, 5, false);
    expect(ctx.amountExpr).toBe("0.5");
  });

  it("amountActive=true → 生成 LOG10 表达式", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.1, 5, true);
    expect(ctx.amountExpr).toContain("LOG10");
    expect(ctx.amountScoreParams).toEqual([5]);
  });

  it("L4 前缀 → l4HitExpr 生成", () => {
    const codes = [{ prefix: "42140000", weighted: 10 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.1, 5, false);
    expect(ctx.l4HitExpr).toContain("b.code LIKE ?");
    expect(ctx.l4Params).toEqual(["42140000%"]);
  });
});

describe("resolveWeights", () => {
  it("control 变体 → 忽略 profile，使用默认值", () => {
    const result = resolveWeights({ w_unspsc: 0.8, w_urgency: 0.1 }, "control");
    expect(result.wUnspsc).toBe(0.5); // 默认值
    expect(result.wUrgency).toBe(0.15);
  });

  it("treatment 变体 → 使用 profile 值", () => {
    const profile = { w_unspsc: 0.6, w_urgency: 0.2, w_amount: 0.1, w_agency: 0.05, w_geo: 0.05, updated_at: new Date().toISOString() };
    const result = resolveWeights(profile, "treatment");
    expect(result.wUnspsc).toBe(0.6);
    expect(result.wUrgency).toBe(0.2);
  });

  it("无效权重 → 回退默认值", () => {
    const profile = { w_unspsc: -1, w_urgency: 2, w_amount: 0, updated_at: new Date().toISOString() };
    const result = resolveWeights(profile, "treatment");
    expect(result.wUnspsc).toBe(0.5); // 负数 → 默认
    expect(result.wUrgency).toBe(0.15); // >1 → 默认
  });

  it("profile 过期 → profileStale=true", () => {
    const profile = { w_unspsc: 0.5, updated_at: "2020-01-01T00:00:00Z" };
    const result = resolveWeights(profile, "treatment");
    expect(result.profileStale).toBe(true);
  });

  it("null profile → profileStale=true", () => {
    const result = resolveWeights(null, "treatment");
    expect(result.profileStale).toBe(true);
  });
});

describe("getAmountPreference", () => {
  it("有足够记录 → active=true", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ center_log: 5.5, cnt: 3 }]]) };
    const result = await getAmountPreference(pool, "user1");
    expect(result.active).toBe(true);
    expect(result.centerLog).toBe(5.5);
  });

  it("记录不足 → active=false", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ center_log: 0, cnt: 1 }]]) };
    const result = await getAmountPreference(pool, "user2");
    expect(result.active).toBe(false);
  });

  it("缓存命中 → 不查询 DB", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ center_log: 3, cnt: 5 }]]) };
    await getAmountPreference(pool, "cached-user");
    const calls1 = pool.query.mock.calls.length;
    await getAmountPreference(pool, "cached-user");
    expect(pool.query.mock.calls.length).toBe(calls1);
  });
});
