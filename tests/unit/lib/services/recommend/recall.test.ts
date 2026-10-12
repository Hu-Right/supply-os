import { describe, it, expect, vi, beforeEach } from "vitest";
import { processInterestCodes, deadlineFallback } from "@/lib/services/recommend/recall";
import type { RowDataPacket } from "mysql2/promise";
import type { Pool } from "mysql2/promise";

/**
 * 召回层：兴趣码 → 骨架节点码（口径单测在 commodity/backbone-path.test.ts，这里测召回形状）
 *
 * 钉住四件事：
 * 1. 谓词只落在节点码倒排表上（`INNER JOIN crm_notice_backbone_nodes cand ON cand.notice_id = n.id
 *    AND cand.node IN (?)`），宽表 backbone_path 的 FIND_IN_SET、桥表 `b.levelN_id IN`、
 *    `b.code LIKE` 与字典行 id 一个都不许再出现（前者口径对但形状错：全表扫，实测 2.4s~3.8s）；
 * 2. 大类层（L1）落点不进谓词 —— 旧实现同样只在 interest.level>=2 时才拼召回条件；
 *    把 L1 放进去等于放开整个大类（temp/probe100 实测：召回从 699 暴涨到 19,326）；
 * 3. 谓词按「最浅覆盖集」压集（rootNodes）：命中深层必然命中祖先 ⇒ 并集不变而块数下降
 *    （temp/probe102 四个真实用户实测命中数完全相等，耗时降 3~5 倍）；
 * 4. 换不出的码进 misses 报出来，不静默丢。
 */

const pathOf = vi.fn();
vi.mock("@/lib/services/commodity/backbone-cache", () => ({
  getBackboneIndex: async () => ({ size: 10, pathOf }),
}));

/** 兴趣码 → 该码在树上的落点链（祖先全存，与真 pathOf 出口形制一致） */
const pad = (c: string) => (/^\d{2,8}$/.test(c) && c.length % 2 === 0 ? c.padEnd(8, "0") : c);
const chainFor = (codes: Record<string, string[]>) => {
  // 真 pathOf 会在内部把成对的 2/4/6 位截断码补零再比，桩里同样先归一再查
  const map = new Map<string, string[]>();
  for (const [k, v] of Object.entries(codes)) map.set(pad(k), v);
  return (input: Iterable<string>) => {
    const list = [...input];
    const codesOut = new Set<string>();
    const misses: string[] = [];
    for (const c of list) {
      const chain = map.get(pad(c));
      if (!chain) {
        misses.push(c);
        continue;
      }
      for (const n of chain) codesOut.add(n);
    }
    const sorted = [...codesOut].sort();
    return { codes: sorted, deepest: sorted.slice(-1), misses, tiers: {} as Record<string, number> };
  };
};

const rows = (...items: Array<{ code: string; level?: number; decayed_weight?: number }>): RowDataPacket[] =>
  items.map((i) => ({ level: 2, decayed_weight: 1, ...i })) as RowDataPacket[];

const pool = {} as Pool;

beforeEach(() => {
  pathOf.mockReset();
});

describe("processInterestCodes", () => {
  it("落点节点进谓词，形状是倒排表的候选 JOIN（不再是全表扫的 FIND_IN_SET）", async () => {
    pathOf.mockImplementation(chainFor({ "42101503": ["UGT-B-05", "UGT-B-0502", "UGT-B-050203", "UGT-B-05020301"] }));
    const out = await processInterestCodes(pool, rows({ code: "42101503" }), { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 });
    expect(out.clauses.join).toBe(
      "INNER JOIN crm_notice_backbone_nodes cand ON cand.notice_id = n.id AND cand.node IN (?)",
    );
    expect(out.clauses.params).toEqual(["UGT-B-05020301"]);
    expect(out.clauses.join).not.toMatch(/b\.level[1-5]_id|b\.code|LIKE|backbone_path/);
    // ? 个数与 params 个数必须一致（不一致就是绑定错位）
    expect(out.clauses.join.split("?").length - 1).toBe(out.clauses.params.length);
    expect(out.scoredNodes).toHaveLength(1);
    expect(out.interestTotal).toBe(1);
    expect(out.misses).toEqual([]);
  });

  it("多个落点 → IN 列表拼接，每个码一个 ?", async () => {
    pathOf.mockImplementation(chainFor({
      "42101503": ["UGT-B-05", "UGT-B-0502", "UGT-B-050203", "UGT-B-05020301"],
      "15101505": ["UGT-B-04", "UGT-B-0401", "UGT-B-040101", "UGT-B-04010105"],
    }));
    const out = await processInterestCodes(
      pool, rows({ code: "42101503" }, { code: "15101505" }), { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 },
    );
    expect(out.clauses.join.split("?").length - 1).toBe(out.clauses.params.length);
    expect(out.clauses.params.length).toBeGreaterThan(1);
  });

  it("截断码（成对的 2/4/6 位）补零后有落点，奇数位与超 8 位进 misses", async () => {
    pathOf.mockImplementation(
      chainFor({
        "72000000": ["UGT-B-01"],
        "25100000": ["UGT-B-04", "UGT-B-0401"],
        "10101500": ["UGT-B-05", "UGT-B-0502", "UGT-B-050203"],
      }),
    );
    const out = await processInterestCodes(
      pool,
      rows({ code: "72" }, { code: "2510" }, { code: "101015" }, { code: "251" }, { code: "123456789" }),
      { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 },
    );
    // 三条合法码都有落点；两条非法形制进 misses（不静默丢）
    expect(out.misses).toEqual(["251", "123456789"]);
    // 但 L1 落点（UGT-B-01）不进谓词，只剩族级落点 UGT-B-0401 与类级 UGT-B-050203
    expect(out.clauses.params).toEqual(["UGT-B-0401", "UGT-B-050203"]);
    // 参与打分的落点数包含 L1（旧实现同样让 level=1 的兴趣码参与加权，只是不拼召回条件）
    expect(out.scoredNodes.map((n) => n.node).sort()).toEqual(["UGT-B-01", "UGT-B-0401", "UGT-B-050203"]);
  });

  it("谓词压到最浅覆盖集：祖先与后代同时命中时只留祖先（并集不变）", async () => {
    pathOf.mockImplementation(
      chainFor({
        "42100000": ["UGT-B-05", "UGT-B-0502"],
        "42101503": ["UGT-B-05", "UGT-B-0502", "UGT-B-050203", "UGT-B-05020301"],
      }),
    );
    const out = await processInterestCodes(
      pool,
      rows({ code: "42100000" }, { code: "42101503" }),
      { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 },
    );
    expect(out.clauses.params).toEqual(["UGT-B-0502"]);
    // 打分侧不压集：深层落点的权重更高，压掉就等于改掉排序信号
    expect(out.scoredNodes.map((n) => n.node)).toEqual(expect.arrayContaining(["UGT-B-0502", "UGT-B-05020301"]));
  });

  it("权重 = 衰减权重 × 有效位深度档（深度算法则不变，只换键）", async () => {
    pathOf.mockImplementation(
      chainFor({
        "42100000": ["UGT-B-05", "UGT-B-0502"], // 有效位 4 ⇒ depth 2 ⇒ 0.6
        "42101503": ["UGT-B-05", "UGT-B-0502", "UGT-B-050203", "UGT-B-05020301"], // 有效位 8 ⇒ depth 4 ⇒ 1.0
      }),
    );
    const out = await processInterestCodes(
      pool,
      rows({ code: "42100000", decayed_weight: 2 }, { code: "42101503", decayed_weight: 3 }),
      { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 },
    );
    const byNode = new Map(out.scoredNodes.map((n) => [n.node, n.weighted]));
    expect(byNode.get("UGT-B-0502")).toBeCloseTo(1.2);
    expect(byNode.get("UGT-B-05020301")).toBeCloseTo(3);
    expect(out.interestTotal).toBeCloseTo(5);
    // 降序：权重高的在前（主查询只取前 N 个参与打分）
    expect(out.scoredNodes[0].node).toBe("UGT-B-05020301");
  });

  it("同一节点被多条兴趣码命中 → 只留最大权重一份（表达式不重复拼）", async () => {
    pathOf.mockImplementation(
      chainFor({
        "42101503": ["UGT-B-05", "UGT-B-05020301"],
        "42101504": ["UGT-B-05", "UGT-B-05020301"],
      }),
    );
    const out = await processInterestCodes(
      pool,
      rows({ code: "42101503", decayed_weight: 1 }, { code: "42101504", decayed_weight: 4 }),
      { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 },
    );
    expect(out.scoredNodes.filter((n) => n.node === "UGT-B-05020301")).toHaveLength(1);
    expect(out.scoredNodes.find((n) => n.node === "UGT-B-05020301")!.weighted).toBeCloseTo(4);
  });

  it("decayed_weight ≤ 0 的兴趣码不进打分与 interestTotal，但照常召回（与旧实现一致）", async () => {
    pathOf.mockImplementation(chainFor({ "42101503": ["UGT-B-05", "UGT-B-05020301"] }));
    const out = await processInterestCodes(pool, rows({ code: "42101503", decayed_weight: 0 }), { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 });
    expect(out.clauses.params).toEqual(["UGT-B-05020301"]);
    expect(out.scoredNodes).toEqual([]);
    expect(out.interestTotal).toBe(0);
  });

  it("空行 / 全无落点 → 谓词空串（调用方据此走截止时间降级）", async () => {
    pathOf.mockImplementation(chainFor({}));
    const out = await processInterestCodes(pool, rows({ code: "99999900" }), { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 });
    expect(out.clauses.join).toBe("");
    expect(out.misses).toEqual(["99999900"]);
    const empty = await processInterestCodes(pool, [], { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 });
    expect(empty.clauses.join).toBe("");
    expect(empty.scoredNodes).toEqual([]);
  });

  it("只有 L1 落点 → 不拼谓词（宁走降级，也不把整个大类当召回条件）", async () => {
    pathOf.mockImplementation(chainFor({ "72": ["UGT-B-01"] }));
    const out = await processInterestCodes(pool, rows({ code: "72" }), { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 });
    expect(out.clauses.join).toBe("");
    expect(out.scoredNodes).toHaveLength(1);
  });
});

describe("deadlineFallback", () => {
  it("返回降级结果结构", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 5 }]]) // COUNT 查询
        .mockResolvedValueOnce([
          // 数据查询
          [
            {
              id: 1, notice_id: "N1", title: "Test", notice_type: "ITB", country: "China",
              deadline_sec: 9999999999, description: "desc", documents: "[]", procurement_files: "[]",
            },
          ],
        ]),
    };
    const result = await deadlineFallback(mockPool as unknown as Pool, 1, 10, 0);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.fallback).toBe("deadline");
    expect(result.items).toHaveLength(1);
  });
});
