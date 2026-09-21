/**
 * 相似机会打分：纯 UNSPSC 品类共现，按每个当前码对 peer 的最深命中层级加权求和。
 */
import { describe, it, expect } from "vitest";
import { LEVEL_WEIGHT, scorePeersByDepth, rankSimilarPeers } from "@/lib/services/notices/similar-scoring";

const row = (notice_id: string, level1_id = "", level2_id = "", level3_id = "", level4_id = "", level5_id = "") => ({
  notice_id, level1_id, level2_id, level3_id, level4_id, level5_id,
});

describe("LEVEL_WEIGHT", () => {
  it("越深权重越高，L5 并入 1.0", () => {
    expect(LEVEL_WEIGHT[1]).toBeCloseTo(0.4);
    expect(LEVEL_WEIGHT[4]).toBeCloseTo(1.0);
    expect(LEVEL_WEIGHT[5]).toBeCloseTo(1.0);
  });
});

describe("scorePeersByDepth", () => {
  it("同一大类下，命中层级越深分越高（L4 > L1）", () => {
    const current = [row("CUR", "10", "110", "1110", "11110")];
    const candidates = [
      row("A", "10", "110", "1110", "11110"), // c1 最深命中 L4 → 1.0
      row("B", "10"), // c1 仅命中 L1 → 0.4
      row("C", "99"), // 无命中 → 不计
    ];
    const scores = scorePeersByDepth(current, candidates);
    expect(scores.get("A")).toBeCloseTo(1.0);
    expect(scores.get("B")).toBeCloseTo(0.4);
    expect(scores.has("C")).toBe(false);
  });

  it("多码分别计分求和，且同一当前码对同一 peer 只计一次", () => {
    const current = [row("CUR", "10"), row("CUR", "20")];
    const candidates = [
      row("A", "10"), // c1 命中 L1
      row("A", "20"), // c2 命中 L1 → A 合计 0.4+0.4
      row("B", "10"), // 仅 c1 命中 → 0.4
    ];
    const scores = scorePeersByDepth(current, candidates);
    expect(scores.get("A")).toBeCloseTo(0.8);
    expect(scores.get("B")).toBeCloseTo(0.4);
  });

  it("同一 peer 多行时取最深命中，与行序无关（浅行在前也取深层）", () => {
    const current = [row("CUR", "10", "110")];
    const candidates = [
      row("A", "10"), // 浅：L1 命中
      row("A", "10", "110"), // 深：L2 命中 → 应取 L2=0.6（旧实现会错取 0.4）
    ];
    const scores = scorePeersByDepth(current, candidates);
    expect(scores.get("A")).toBeCloseTo(0.6);
  });
});

describe("rankSimilarPeers", () => {
  it("分数降序、limit 截断、0 分不入", () => {
    const current = [row("CUR", "1")];
    const candidates = [row("A", "1"), row("B", "1"), row("D", "9")];
    const ranked = rankSimilarPeers(current, candidates, 2);
    expect(ranked.map((r) => r.notice_id)).toEqual(["A", "B"]);
  });

  it("同分按 deadline_ts 升序（更早优先），0/空视为最晚", () => {
    const current = [row("CUR", "1")];
    const candidates = [
      row("LATE", "1"),
      row("SOON", "1"),
      row("NODEADLINE", "1"),
    ];
    const ranked = rankSimilarPeers(
      current,
      candidates,
      10,
      { LATE: 200, SOON: 100, NODEADLINE: 0 },
    );
    expect(ranked.map((r) => r.notice_id)).toEqual(["SOON", "LATE", "NODEADLINE"]);
  });
});
