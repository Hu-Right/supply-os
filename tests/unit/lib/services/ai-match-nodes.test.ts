/**
 * AI 匹配粗筛数据加载器 —— 节点码口径（Task 14）
 *
 * 为什么必须改：旧实现两条 SQL 都活在旧字典上：
 * - 公告侧读桥表 `level1_id..level5_id`（旧字典行 id 空间），且要经
 *   `crm_bid_notices.notice_id`（外部编号）中转 —— 那个编号实测有 21,524 条撞号风险，
 *   相似公告与行业墙都因此改成宽表主键点查，这里不改就是第三处例外；
 * - 供应商侧 `crm_supplier_backbone_interests` INNER JOIN 字典 + 4 级父链自 JOIN
 *   （字典只镜像了 旧品类码 的一部分：品目层 10,661 行 vs 骨架树 150,006 行）。
 * 改后：公告侧点查宽表 `backbone_path`；供应商侧直接取兴趣表自带的 8 位 `code`，
 * 交同一份骨架索引（commodity/backbone-cache）换算成节点码 —— 换算口径不在这里重写。
 * fail-safe 语义保持不变：任一环节失败/无数据 → 退化为纯词项粗筛，绝不打断 AI 匹配主流程。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const pathOf = vi.fn();
const getBackboneIndex = vi.fn(async () => ({ size: 100, pathOf }) as never);
vi.mock("@/lib/services/commodity/backbone-cache", () => ({
  getBackboneIndex: (...args: unknown[]) => getBackboneIndex(...(args as [])),
}));

import { loadMatchNodeData } from "@/lib/services/ai-match/match-nodes";
import type { Pool } from "mysql2/promise";

/** 依次吐出给定结果，同时记下每条 SQL（口径断言要看字面） */
const sqls: string[] = [];
const makePool = (results: Array<Array<unknown> | Error>) =>
  ({
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      sqls.push(sql);
      const r = results.shift();
      if (r instanceof Error) throw r;
      return [r ?? []];
    }),
  }) as unknown as Pool;

const CHAIN_5 = ["UGT-42", "UGT-4210", "UGT-421015", "UGT-42101503", "UGT-4210150301"];

beforeEach(() => {
  sqls.length = 0;
  pathOf.mockReset();
  getBackboneIndex.mockReset();
  getBackboneIndex.mockImplementation(async () => ({ size: 100, pathOf }) as never);
});

describe("公告侧", () => {
  it("点查宽表主键取 backbone_path，不回桥表也不读五级 id 列", async () => {
    pathOf.mockReturnValue({ codes: CHAIN_5, deepest: [], misses: [], tiers: {} });
    const pool = makePool([[{ p: CHAIN_5.join(",") }], [{ supplier_id: 7, code: "42101503" }]]);
    const data = await loadMatchNodeData(pool, 1, [7]);
    expect(sqls[0]).toContain("crm_notice_search");
    expect(sqls[0]).toContain("backbone_path");
    expect(sqls[0]).toMatch(/id = \?/);
    expect(sqls[0]).not.toMatch(/crm_bid_notice_unspsc_codes|crm_bid_notices|level[1-5]_id/);
    expect([...data.noticeNodes]).toEqual(CHAIN_5);
  });

  it("列里的脏 token 不进集合（拆列只走 fromBackbonePathColumn，旧码制也算脏）", async () => {
    pathOf.mockReturnValue({ codes: [], deepest: [], misses: [], tiers: {} });
    // 这里的旧形制字面量是故意的（勿随全局码制替换把它改正常码）：列形制解析不走
    // normalizeBackboneNodeKey（那是入口层的事），所以改码前的旧码在列里就是脏 token，
    // 必须挡在集合外，而不是“看起来能匹配”地放进事实源。
    const pool = makePool([[{ p: "UGT-42,UGT-XY,42101503,UGT-B-42,UGT-4210," }]]);
    const data = await loadMatchNodeData(pool, 1, [7]);
    expect([...data.noticeNodes]).toEqual(["UGT-42", "UGT-4210"]);
  });

  it("公告无节点码 → 短路：不查兴趣表，也不载入骨架索引", async () => {
    const pool = makePool([[{ p: null }]]);
    const data = await loadMatchNodeData(pool, 1, [7]);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(getBackboneIndex).not.toHaveBeenCalled();
    expect(data.noticeNodes.size).toBe(0);
    expect(data.supplierNodes.size).toBe(0);
  });
});

describe("供应商侧", () => {
  it("读兴趣表自带 code，不回旧字典也不做父链自 JOIN", async () => {
    pathOf.mockReturnValue({ codes: CHAIN_5, deepest: [], misses: [], tiers: {} });
    const pool = makePool([
      [{ p: CHAIN_5.join(",") }],
      [
        { supplier_id: 7, code: "42101503" },
        { supplier_id: 7, code: "42101504" },
        { supplier_id: 8, code: "42101503" },
      ],
    ]);
    const data = await loadMatchNodeData(pool, 1, [7, 8]);
    expect(sqls[1]).toContain("crm_supplier_backbone_interests");
    expect(sqls[1]).not.toMatch(/crm_unspsc_codes/);
    expect([...data.supplierNodes.keys()]).toEqual([7, 8]);
    expect([...data.supplierNodes.get(7)!]).toEqual(CHAIN_5);
    // 同一供应商的多条码一次换算（pathOf 收到该供应商的码集合，而不是逐码查库）
    expect(pathOf).toHaveBeenCalledTimes(2);
    expect(pathOf.mock.calls[0]![0]).toEqual(["42101503", "42101504"]);
  });

  it("空 code 行不送换算，也不建空键", async () => {
    pathOf.mockReturnValue({ codes: CHAIN_5, deepest: [], misses: [], tiers: {} });
    const pool = makePool([
      [{ p: CHAIN_5.join(",") }],
      [
        { supplier_id: 7, code: "" },
        { supplier_id: 8, code: "42101503" },
      ],
    ]);
    const data = await loadMatchNodeData(pool, 1, [7, 8]);
    expect(data.supplierNodes.has(7)).toBe(false);
    expect(pathOf).toHaveBeenCalledTimes(1);
  });

  it("换不出的码点名告警，不静默丢（仍写已算出的部分）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    pathOf.mockReturnValue({ codes: ["UGT-42"], deepest: [], misses: ["99999999", "99999998"], tiers: {} });
    const pool = makePool([[{ p: CHAIN_5.join(",") }], [{ supplier_id: 7, code: "42101503" }]]);
    const data = await loadMatchNodeData(pool, 1, [7]);
    expect([...data.supplierNodes.get(7)!]).toEqual(["UGT-42"]);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).toContain("99999999");
    warn.mockRestore();
  });

  it("骨架索引不可用 → 保留公告侧、供应商侧空，不抛（退化纯词项）", async () => {
    getBackboneIndex.mockImplementation(async () => null as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pool = makePool([[{ p: CHAIN_5.join(",") }], [{ supplier_id: 7, code: "42101503" }]]);
    const data = await loadMatchNodeData(pool, 1, [7]);
    expect([...data.noticeNodes]).toEqual(CHAIN_5);
    expect(data.supplierNodes.size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("fail-safe 与短路", () => {
  it("查询异常 → 空集合且不抛", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pool = makePool([new Error("DB_DOWN")]);
    const data = await loadMatchNodeData(pool, 1, [7]);
    expect(data.noticeNodes.size).toBe(0);
    expect(data.supplierNodes.size).toBe(0);
    warn.mockRestore();
  });

  it("候选 supplier id 全无效（手动新建未落 id）→ 不发任何查询", async () => {
    const pool = makePool([]);
    const data = await loadMatchNodeData(pool, 1, [0, Number.NaN]);
    expect(pool.query).not.toHaveBeenCalled();
    expect(data.noticeNodes.size).toBe(0);
  });
});
