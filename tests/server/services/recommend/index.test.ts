/**
 * server/services/recommend/ 算法子模块测试
 * 覆盖纯函数：text-similarity, rerank, ab-testing, scoring, recall
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── text-similarity ──
import { tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS } from "../../../../server/services/recommend/text-similarity";

describe("tokenizeNoticeText", () => {
  it("英文文本分词并过滤停用词", () => {
    const tokens = tokenizeNoticeText("Supply of Medical Equipment and Services");
    expect(tokens.has("supply")).toBe(false); // 停用词
    expect(tokens.has("medical")).toBe(true);
    expect(tokens.has("equipment")).toBe(true);
    expect(tokens.has("services")).toBe(false); // 停用词
  });

  it("CJK 文本生成 bigram", () => {
    const tokens = tokenizeNoticeText("医疗设备采购");
    // "医疗设备采购" → 双字 bigram: 医疗, 疗设, 设备, 备采, 采购
    expect(tokens.has("医疗")).toBe(true);
    expect(tokens.has("采购")).toBe(true);
    expect(tokens.has("设备")).toBe(true);
  });

  it("空文本返回空集合", () => {
    expect(tokenizeNoticeText("").size).toBe(0);
    expect(tokenizeNoticeText(null as any).size).toBe(0);
  });

  it("短英文词（<3字符）不进集合", () => {
    const tokens = tokenizeNoticeText("of an the cat dog");
    expect(tokens.has("of")).toBe(false);
    expect(tokens.has("an")).toBe(false);
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("cat")).toBe(true);
    expect(tokens.has("dog")).toBe(true);
  });
});

describe("jaccardTokenSim", () => {
  it("完全相同集合返回 1", () => {
    const a = new Set(["x", "y", "z"]);
    expect(jaccardTokenSim(a, a)).toBe(1);
  });

  it("不相交集合返回 0", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardTokenSim(a, b)).toBe(0);
  });

  it("空集合返回 0", () => {
    expect(jaccardTokenSim(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccardTokenSim(new Set(["a"]), new Set())).toBe(0);
  });

  it("部分交集正确计算", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    // |A∩B|=2, |A∪B|=4 → 2/4=0.5
    expect(jaccardTokenSim(a, b)).toBe(0.5);
  });

  it("对称性 jaccard(a,b)===jaccard(b,a)", () => {
    const a = new Set(["x", "y"]);
    const b = new Set(["y", "z"]);
    expect(jaccardTokenSim(a, b)).toBe(jaccardTokenSim(b, a));
  });
});

it("S_TEXT_BONUS 常量 = 0.05", () => {
  expect(S_TEXT_BONUS).toBe(0.05);
});

// ── rerank ──
import { mmrRerankPage, buildRecoReasons } from "../../../../server/services/recommend/rerank";

describe("mmrRerankPage", () => {
  it("≤2 条直接返回原数组", () => {
    const rows = [{ reco_score: 1 }, { reco_score: 2 }];
    expect(mmrRerankPage(rows)).toBe(rows);
  });

  it("高分且多样性优先", () => {
    const rows = [
      { reco_score: 10, codes_concat: "1001,1002" },
      { reco_score: 9, codes_concat: "1001,1002" }, // 与第1条相似
      { reco_score: 8, codes_concat: "2001,2002" }, // 不同类
    ];
    const result = mmrRerankPage(rows);
    // 第1条选最高分；第2条因与第1条相似被惩罚，第3条虽分低但多样性好
    expect(result[0]).toBe(rows[0]); // 最高分优先
    expect(result.length).toBe(3);
  });
});

describe("buildRecoReasons", () => {
  const now = 1700000000;

  it("L4 命中 → industry_match_l4", () => {
    const reasons = buildRecoReasons({ l4_hit: 1, deadline_ts: null, amount_usd_cached: 0 }, now);
    expect(reasons).toContain("industry_match_l4");
  });

  it("临期（30天内）→ recent_deadline", () => {
    const deadlineTs = now + 15 * 86400; // 15天后
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: deadlineTs, amount_usd_cached: 0 }, now);
    expect(reasons).toContain("recent_deadline");
  });

  it("高价值（≥100万USD）→ high_value", () => {
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: null, amount_usd_cached: 2_000_000 }, now);
    expect(reasons).toContain("high_value");
  });

  it("无特殊标签 → industry_match 兜底", () => {
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: null, amount_usd_cached: 0 }, now);
    expect(reasons).toEqual(["industry_match"]);
  });

  it("最多返回 2 条原因", () => {
    const reasons = buildRecoReasons({
      l4_hit: 1, deadline_ts: now + 10 * 86400, amount_usd_cached: 5_000_000,
    }, now);
    expect(reasons.length).toBe(2);
  });

  it("deadline_ts 毫秒级正确转换", () => {
    const deadlineTsMs = (now + 5 * 86400) * 1000; // 毫秒级
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: deadlineTsMs, amount_usd_cached: 0 }, now);
    expect(reasons).toContain("recent_deadline");
  });

  it("已过期截止不触发 recent_deadline", () => {
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: now - 86400, amount_usd_cached: 0 }, now);
    expect(reasons).toEqual(["industry_match"]);
  });
});

// ── ab-testing ──
import { recoVariant, AB_TREATMENT_PCT } from "../../../../server/services/recommend/ab-testing";

describe("ab-testing", () => {
  it("AB_TREATMENT_PCT 默认 0", () => {
    // 测试环境未设 RECO_AB_TREATMENT_PCT，默认 0
    expect(AB_TREATMENT_PCT).toBe(0);
  });

  it("默认全 control", () => {
    expect(recoVariant("user-1")).toBe("control");
    expect(recoVariant("user-2")).toBe("control");
  });
});

// ── scoring ──
import { buildScoringContext, resolveWeights } from "../../../../server/services/recommend/scoring";

describe("buildScoringContext", () => {
  it("空 scoredCodes → matchWeightExpr='0'", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.15, 5, false);
    expect(ctx.matchWeightExpr).toBe("0");
    expect(ctx.denominator).toBe(1); // interestTotal=0 → 兜底 1
  });

  it("有 scoredCodes → 生成 LIKE 表达式", () => {
    const codes = [{ prefix: "4214", weighted: 2.5 }, { prefix: "5020", weighted: 1.0 }];
    const ctx = buildScoringContext(codes, 10, 0.5, 0.15, 0.1, 0.15, 5, true);
    expect(ctx.matchWeightExpr).toContain("LIKE");
    expect(ctx.scoreParams).toContain("4214%");
    expect(ctx.scoreParams).toContain(2.5);
    expect(ctx.denominator).toBe(10);
  });

  it("amountActive=false → amountExpr='0.5'", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.15, 5, false);
    expect(ctx.amountExpr).toBe("0.5");
    expect(ctx.amountScoreParams).toEqual([]);
  });

  it("amountActive=true → amountExpr 含 LOG10", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.15, 5, true);
    expect(ctx.amountExpr).toContain("LOG10");
    expect(ctx.amountScoreParams).toEqual([5]);
  });

  it("l4 前缀（≥8位）生成 OR 表达式", () => {
    const codes = [{ prefix: "42142300", weighted: 1 }];
    const ctx = buildScoringContext(codes, 1, 0.5, 0.15, 0.1, 0.15, 5, false);
    expect(ctx.l4HitExpr).toContain("LIKE");
    expect(ctx.l4Params).toEqual(["42142300%"]);
  });

  it("短前缀（<8位）不生成 l4 表达式", () => {
    const codes = [{ prefix: "42", weighted: 1 }];
    const ctx = buildScoringContext(codes, 1, 0.5, 0.15, 0.1, 0.15, 5, false);
    expect(ctx.l4HitExpr).toBe("0");
    expect(ctx.l4Params).toEqual([]);
  });
});

describe("resolveWeights", () => {
  it("control 变体忽略 profile，使用默认值", () => {
    const profile = { w_unspsc: 0.6, w_urgency: 0.2, w_amount: 0.1, w_agency: 0.15, w_geo: 0.1, updated_at: new Date().toISOString() };
    const result = resolveWeights(profile as any, "control");
    expect(result.wUnspsc).toBe(0.5); // 默认
    expect(result.profileStale).toBe(false);
  });

  it("treatment 变体使用 profile 值", () => {
    const profile = { w_unspsc: 0.55, w_urgency: 0.18, w_amount: 0.12, w_agency: 0.15, w_geo: 0.1, updated_at: new Date().toISOString() };
    const result = resolveWeights(profile as any, "treatment");
    expect(result.wUnspsc).toBe(0.55);
    expect(result.wUrgency).toBe(0.18);
    expect(result.wAmount).toBe(0.12);
  });

  it("null profile → 全部默认值 + profileStale=true", () => {
    const result = resolveWeights(null, "treatment");
    expect(result.wUnspsc).toBe(0.5);
    expect(result.profileStale).toBe(true);
  });

  it("profile 超 24h → profileStale=true", () => {
    const oldDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const profile = { w_unspsc: 0.55, updated_at: oldDate };
    const result = resolveWeights(profile as any, "treatment");
    expect(result.profileStale).toBe(true);
  });
});

// ── recall ──
import { significantPrefix, processInterestCodes } from "../../../../server/services/recommend/recall";

describe("significantPrefix", () => {
  it("去除尾部 00 段", () => {
    expect(significantPrefix("42140000")).toBe("4214");
    expect(significantPrefix("42000000")).toBe("42");
  });

  it("无尾部 00 保持不变", () => {
    expect(significantPrefix("42142301")).toBe("42142301");
  });

  it("2 位码不截断", () => {
    expect(significantPrefix("42")).toBe("42");
  });
});

describe("processInterestCodes", () => {
  it("空行返回空结果", () => {
    const result = processInterestCodes([], {});
    expect(result.scoredCodes).toEqual([]);
    expect(result.interestTotal).toBe(0);
    expect(result.clauses.bridgeWhere).toBe("");
  });

  it("正常兴趣码生成加权前缀", () => {
    const rows = [{ code: "42142300", level: 4, code_id: 100, decayed_weight: 3.0 }];
    const result = processInterestCodes(rows as any, { 3: 1.5 });
    expect(result.scoredCodes.length).toBe(1);
    expect(result.scoredCodes[0].prefix).toBe("421423");
    expect(result.scoredCodes[0].weighted).toBeCloseTo(4.5); // 3.0 * 1.5 (depth=3)
    expect(result.interestTotal).toBe(3.0);
  });

  it("level≥2 + code_id>0 → 按 id 召回", () => {
    const rows = [{ code: "4214", level: 2, code_id: 50, decayed_weight: 1.0 }];
    const result = processInterestCodes(rows as any, {});
    expect(result.clauses.bridgeWhere).toContain("level2_id");
    expect(result.clauses.params).toContain(50);
  });

  it("level≥2 + code_id=0 + prefix≥4 → LIKE 召回", () => {
    const rows = [{ code: "42140000", level: 2, code_id: 0, decayed_weight: 1.0 }];
    const result = processInterestCodes(rows as any, {});
    expect(result.clauses.bridgeWhere).toContain("LIKE");
    expect(result.clauses.params).toContain("4214%");
  });

  it("decayed_weight≤0 跳过", () => {
    const rows = [{ code: "4214", level: 2, code_id: 10, decayed_weight: 0 }];
    const result = processInterestCodes(rows as any, {});
    expect(result.scoredCodes.length).toBe(0);
    expect(result.interestTotal).toBe(0);
  });
});
