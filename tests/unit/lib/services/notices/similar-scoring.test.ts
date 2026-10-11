/**
 * 相似机会打分：骨架节点码口径。
 *
 * 覆盖：sharedDepth 最长公共前缀层级（节点码自带层级，不依赖桥表 level 列）、
 *       祖先全存时「最深节点代表集」与原集合取 max 等价、同一 peer 取最深与行序无关、
 *       多码求和、排序与 deadline 兜底、巨量码公告的代表集截断。
 */
import { describe, it, expect } from "vitest";
import {
  LEVEL_WEIGHT,
  SIMILAR_NODE_CAP,
  leafNodes,
  rankSimilarPeers,
  scorePeersByDepth,
  sharedDepth,
  type NodeRow,
} from "@/lib/services/notices/similar-scoring";

const n = (notice_id: string, node: string): NodeRow => ({ notice_id, node });

describe("sharedDepth 骨架节点码", () => {
  it("同子类 → 4，同品目 → 5，只同大类 → 1，跨大类 → 0", () => {
    expect(sharedDepth("UGT-B-07020102", "UGT-B-07020102")).toBe(4);
    expect(sharedDepth("UGT-B-0702010204", "UGT-B-0702010204")).toBe(5);
    expect(sharedDepth("UGT-B-07020102", "UGT-B-07020103")).toBe(3);
    expect(sharedDepth("UGT-B-070201", "UGT-B-070301")).toBe(1);
    expect(sharedDepth("UGT-B-0702", "UGT-B-0802")).toBe(0);
  });

  it("层级对祖先单调：父自身 = 父的层级，不会跳层命中", () => {
    expect(sharedDepth("UGT-B-07020102", "UGT-B-070201")).toBe(3);
    expect(sharedDepth("UGT-B-0702010204", "UGT-B-0702")).toBe(2);
  });

  it("形制不符（空值、非树码）→ 0，不猜层级", () => {
    expect(sharedDepth("", "UGT-B-07")).toBe(0);
    expect(sharedDepth("UGT-C-0702", "UGT-B-0702")).toBe(0);
    expect(sharedDepth("721015", "721015")).toBe(0);
  });
});

describe("leafNodes 代表集", () => {
  it("祖先全存的列值里，只留下没有后代的节点", () => {
    expect(leafNodes(["UGT-B-07", "UGT-B-0702", "UGT-B-070201", "UGT-B-07020102", "UGT-B-0702010204"])).toEqual([
      "UGT-B-0702010204",
    ]);
  });

  it("两个分支各留自己的叶子，升序稳定", () => {
    expect(leafNodes(["UGT-B-01", "UGT-B-0101", "UGT-B-010101", "UGT-B-010102", "UGT-B-01010201"])).toEqual([
      "UGT-B-010101",
      "UGT-B-01010201",
    ]);
  });

  it("非祖先全存的散码集合原样保留（不因为缺链顶就丢节点）", () => {
    expect(leafNodes(["UGT-B-0702", "UGT-B-0803"])).toEqual(["UGT-B-0702", "UGT-B-0803"]);
  });
});

describe("LEVEL_WEIGHT", () => {
  it("越深权重越高，L5 并入 1.0", () => {
    expect(LEVEL_WEIGHT[1]).toBeCloseTo(0.4);
    expect(LEVEL_WEIGHT[4]).toBeCloseTo(1.0);
    expect(LEVEL_WEIGHT[5]).toBeCloseTo(1.0);
  });
});

describe("scorePeersByDepth 按最深共享节点加权", () => {
  it("同一大类下命中越深分越高（L4 > L1）", () => {
    const current = [n("CUR", "UGT-B-07020102")];
    const candidates = [
      n("A", "UGT-B-0702010204"), // 共享到 L4
      n("B", "UGT-B-0702"), // 只共享到 L2
      n("C", "UGT-B-08"), // 跨大类 → 不计
    ];
    const scores = scorePeersByDepth(current, candidates);
    expect(scores.get("A")).toBeCloseTo(LEVEL_WEIGHT[4]!);
    expect(scores.get("B")).toBeCloseTo(LEVEL_WEIGHT[2]!);
    expect(scores.has("C")).toBe(false);
  });

  it("多码分别计分求和，同一当前码对同一 peer 只计一次", () => {
    const current = [n("CUR", "UGT-B-010101"), n("CUR", "UGT-B-0201")];
    const candidates = [
      n("A", "UGT-B-010101"),
      n("A", "UGT-B-0201"),
      n("B", "UGT-B-010101"),
    ];
    const scores = scorePeersByDepth(current, candidates);
    expect(scores.get("A")).toBeCloseTo(LEVEL_WEIGHT[3]! + LEVEL_WEIGHT[2]!);
    expect(scores.get("B")).toBeCloseTo(LEVEL_WEIGHT[3]!);
  });

  it("同一 peer 多行取最深命中，与行序无关（浅行在前也取深层）", () => {
    const current = [n("CUR", "UGT-B-07020102")];
    const candidates = [n("A", "UGT-B-07"), n("A", "UGT-B-070201")];
    const scores = scorePeersByDepth(current, candidates);
    expect(scores.get("A")).toBeCloseTo(LEVEL_WEIGHT[3]!);
  });

  it("祖先全存的浅层节点不重复计分：链上只算最深那个", () => {
    const current = [
      n("CUR", "UGT-B-07"),
      n("CUR", "UGT-B-0702"),
      n("CUR", "UGT-B-070201"),
    ];
    const candidates = [n("A", "UGT-B-070201")];
    const scores = scorePeersByDepth(current, candidates);
    // 当前侧代表集 = 叶子 UGT-B-070201 一个 ⇒ 只计一次
    expect(scores.get("A")).toBeCloseTo(LEVEL_WEIGHT[3]!);
  });

  it("代表集有上限，巨量码公告不会全对全", () => {
    // 60 个同层互不为祖先的中类节点：不分上限就会做 60×60 次比较、拿 60×0.6=36 分
    const codes = Array.from({ length: 60 }, (_, i) => `UGT-B-07${String(i + 1).padStart(2, "0")}`);
    const many: NodeRow[] = codes.map((node) => n("P", node));
    const current: NodeRow[] = codes.map((node) => n("CUR", node));
    const scores = scorePeersByDepth(current, many);
    // 两侧都只留 SIMILAR_NODE_CAP 个代表 ⇒ 分数上限就是 cap × 最深权重
    expect(scores.get("P")).toBeCloseTo(SIMILAR_NODE_CAP * LEVEL_WEIGHT[2]!);
  });
});

describe("rankSimilarPeers", () => {
  it("分数降序、limit 截断、0 分不入", () => {
    const current = [n("CUR", "UGT-B-07")];
    const candidates = [n("A", "UGT-B-07"), n("B", "UGT-B-07"), n("D", "UGT-B-08")];
    const ranked = rankSimilarPeers(current, candidates, 2);
    expect(ranked.map((r) => r.notice_id)).toEqual(["A", "B"]);
  });

  it("同分按 deadline_ts 升序（更早优先），0/空视为最晚", () => {
    const current = [n("CUR", "UGT-B-07")];
    const candidates = [n("LATE", "UGT-B-07"), n("SOON", "UGT-B-07"), n("NODEADLINE", "UGT-B-07")];
    const ranked = rankSimilarPeers(current, candidates, 10, { LATE: 200, SOON: 100, NODEADLINE: 0 });
    expect(ranked.map((r) => r.notice_id)).toEqual(["SOON", "LATE", "NODEADLINE"]);
  });
});
