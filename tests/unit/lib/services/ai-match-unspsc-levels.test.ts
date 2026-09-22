/**
 * AI 匹配 UNSPSC 粗筛数据加载器测试
 * @module tests/unit/lib/services/ai-match-unspsc-levels.test.ts
 * @description 只读聚合：公告桥接行 → 层级 id 集；供应商兴趣码字典链 → 各级祖先 id；
 *              任一查询异常 / 空候选 → 空映射（fail-safe，绝不抛出打断匹配主流程）。
 */
import { describe, it, expect, vi } from "vitest";
import { loadUnspscMatchData } from "@/lib/services/ai-match/unspsc-levels";

/** 公告桥接行（level*_id 为 VARCHAR，无值列为空串） */
const bridgeRow = (over: Record<string, string> = {}) => ({
  level1_id: "", level2_id: "", level3_id: "", level4_id: "", level5_id: "", ...over,
});
/** 供应商兴趣码链行：n0/l0 = 自身，n1/l1 = 父……（LEFT JOIN 未命中为 null） */
const chainRow = (supplierId: number, nodes: Array<[number | null, number | null]>) => ({
  supplier_id: supplierId,
  n0: nodes[0]?.[0] ?? null, l0: nodes[0]?.[1] ?? null,
  n1: nodes[1]?.[0] ?? null, l1: nodes[1]?.[1] ?? null,
  n2: nodes[2]?.[0] ?? null, l2: nodes[2]?.[1] ?? null,
  n3: nodes[3]?.[0] ?? null, l3: nodes[3]?.[1] ?? null,
  n4: nodes[4]?.[0] ?? null, l4: nodes[4]?.[1] ?? null,
});

const poolWith = (...results: Array<Array<unknown> | Error>) => ({
  query: vi.fn(async () => {
    const r = results.shift();
    if (r instanceof Error) throw r;
    return [r ?? []];
  }),
} as any);

describe("loadUnspscMatchData", () => {
  it("公告桥接行聚合为层级 id 集：多行并集、空串列剔除、id 字符串归一", async () => {
    const pool = poolWith(
      [bridgeRow({ level2_id: "200", level5_id: "500" }), bridgeRow({ level5_id: "501", level3_id: "300" })],
      [],
    );
    const data = await loadUnspscMatchData(pool, 1, [7]);
    expect([...data.noticeLevels.get(5)!]).toEqual(["500", "501"]);
    expect([...data.noticeLevels.get(2)!]).toEqual(["200"]);
    expect([...data.noticeLevels.get(3)!]).toEqual(["300"]);
    expect(data.noticeLevels.has(1)).toBe(false); // 全空串的层不建键
  });

  it("供应商链行展开为各级祖先 id 集（null 父级剔除，数值 id 归一为字符串）", async () => {
    const pool = poolWith(
      [bridgeRow({ level5_id: "500" })], // 公告有码才继续查供应商侧
      [chainRow(7, [[175743, 5], [101722, 4], [null, null]])],
    );
    const data = await loadUnspscMatchData(pool, 1, [7]);
    const levels = data.supplierLevels.get(7)!;
    expect([...levels.get(5)!]).toEqual(["175743"]);
    expect([...levels.get(4)!]).toEqual(["101722"]);
    expect(levels.has(3)).toBe(false);
  });

  it("同一供应商多兴趣码行 → 各级并集", async () => {
    const pool = poolWith(
      [bridgeRow({ level5_id: "500" })],
      [
        chainRow(7, [[100, 5], [90, 4]]),
        chainRow(7, [[101, 5], [90, 4]]),
      ],
    );
    const data = await loadUnspscMatchData(pool, 1, [7]);
    expect([...data.supplierLevels.get(7)!.get(5)!]).toEqual(["100", "101"]);
    expect([...data.supplierLevels.get(7)!.get(4)!]).toEqual(["90"]);
  });

  it("公告无桥接码 → 不再查供应商侧（短路省一条 SQL）", async () => {
    const pool = poolWith([]);
    const data = await loadUnspscMatchData(pool, 1, [7]);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(data.noticeLevels.size).toBe(0);
    expect(data.supplierLevels.size).toBe(0);
  });

  it("查询异常 → 空映射且不抛（fail-safe 退化为纯词项粗筛）", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("DB_DOWN")) } as any;
    const data = await loadUnspscMatchData(pool, 1, [7]);
    expect(data.noticeLevels.size).toBe(0);
    expect(data.supplierLevels.size).toBe(0);
  });

  it("候选 supplier id 全无效（手动新建未落 id）→ 不发任何查询", async () => {
    const pool = poolWith();
    const data = await loadUnspscMatchData(pool, 1, [0, Number.NaN]);
    expect(pool.query).not.toHaveBeenCalled();
    expect(data.noticeLevels.size).toBe(0);
  });
});
