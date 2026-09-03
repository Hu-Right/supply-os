import { describe, it, expect } from "vitest";
import { mmrRerankPage, buildRecoReasons } from "@/lib/services/recommend/rerank";

describe("mmrRerankPage", () => {
  it("≤2 条 → 原样返回", () => {
    const rows = [{ reco_score: 1 }, { reco_score: 2 }];
    expect(mmrRerankPage(rows)).toBe(rows);
  });

  it("空数组 → 空数组", () => {
    expect(mmrRerankPage([])).toEqual([]);
  });

  it("高分项优先选中", () => {
    const rows = [
      { reco_score: 0.1, codes_concat: "12,34" },
      { reco_score: 0.9, codes_concat: "56,78" },
      { reco_score: 0.5, codes_concat: "90,12" },
    ];
    const result = mmrRerankPage(rows);
    // 最高分项 (0.9) 应排第一
    expect(result[0].reco_score).toBe(0.9);
  });

  it("MMR 多样性：相似码被惩罚", () => {
    const rows = [
      { reco_score: 0.9, codes_concat: "12,34" },
      { reco_score: 0.8, codes_concat: "12,34" }, // 与第一条完全相同
      { reco_score: 0.7, codes_concat: "56,78" }, // 完全不同码
    ];
    const result = mmrRerankPage(rows);
    // 第二条应优先选不同码的 (0.7) 而非相似码的 (0.8)
    expect(result[1].codes_concat).toBe("56,78");
  });
});

describe("buildRecoReasons", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it("l4_hit > 0 → industry_match_l4", () => {
    const reasons = buildRecoReasons({ l4_hit: 1, deadline_ts: null, amount_usd_cached: 0 }, nowSec);
    expect(reasons).toContain("industry_match_l4");
  });

  it("临期（30 天内）→ recent_deadline", () => {
    const deadline = nowSec + 15 * 86400; // 15 天后
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: deadline, amount_usd_cached: 0 }, nowSec);
    expect(reasons).toContain("recent_deadline");
  });

  it("高价值（≥1M USD）→ high_value", () => {
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: null, amount_usd_cached: 1_000_000 }, nowSec);
    expect(reasons).toContain("high_value");
  });

  it("无特殊命中 → industry_match 兜底", () => {
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: null, amount_usd_cached: 0 }, nowSec);
    expect(reasons).toEqual(["industry_match"]);
  });

  it("最多返回 2 条原因", () => {
    const deadline = nowSec + 10 * 86400;
    const reasons = buildRecoReasons({ l4_hit: 1, deadline_ts: deadline, amount_usd_cached: 2_000_000 }, nowSec);
    expect(reasons.length).toBeLessThanOrEqual(2);
  });

  it("deadline_ts 毫秒级自动转秒级", () => {
    const deadlineMs = (nowSec + 10 * 86400) * 1000;
    const reasons = buildRecoReasons({ l4_hit: 0, deadline_ts: deadlineMs, amount_usd_cached: 0 }, nowSec);
    expect(reasons).toContain("recent_deadline");
  });
});
