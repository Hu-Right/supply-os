/**
 * 宽表数据加载与对账检测层覆盖（红线 #6 相关模块纳入覆盖率白名单的前置）
 *
 * 这些函数都是 DB 侧批处理：mocked pool 按 SQL 内容分派返回批次，
 * 断言的是「多行归并/去重/失败降级/缓存复用」这些真实会静默改变搜索结果的分支。
 * 模块级缓存（别名表）会跨用例存活，因此失败路径必须先于成功路径执行。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import {
  loadAliasMap, loadTranslationsByNoticeIds, loadUnspscByNoticeIds,
} from "@/lib/services/search-sync/wide-row-builder";
import { detectDeadlineDrift, reconcileGhostRows } from "@/lib/services/search-sync/wide-row-reconcile";
import { resetBackboneCache } from "@/lib/services/commodity/backbone-cache";

/** 按 SQL 关键字分派批次，未命中返回空集（第二形参仅为让 mock.calls 能取到绑定参数） */
function makePool(byKeyword: Array<[RegExp, unknown[][]]>, alsoThrow?: RegExp) {
  const query = vi.fn(async (sql: string, _values: unknown = null) => {
    const s = String(sql);
    if (alsoThrow && alsoThrow.test(s)) throw new Error("db down");
    for (const [re, batches] of byKeyword) {
      if (re.test(s)) return [batches.shift() ?? []];
    }
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("loadAliasMap", () => {
  it("查询失败且无缓存 → 返回空映射（不抛错，宽表构建继续）", async () => {
    const { pool } = makePool([], /crm_agency_aliases/);
    expect((await loadAliasMap(pool)).size).toBe(0);
  });

  it("成功构建 alias→canonical（大写归一 key）", async () => {
    const { pool } = makePool([
      [/crm_agency_aliases/, [[
        { canonical: "United Nations Development Programme", alias: " undp " },
        { canonical: "UNICEF", alias: "unicef" },
      ]]],
    ]);
    const map = await loadAliasMap(pool);
    expect(map.get("UNDP")).toBe("United Nations Development Programme");
    expect(map.get("UNICEF")).toBe("UNICEF");
  });

  it("第二次调用命中 10 分钟缓存，不再查库", async () => {
    const { pool, query } = makePool([[/crm_agency_aliases/, [[{ canonical: "X", alias: "y" }]]]]);
    await loadAliasMap(pool);
    const before = query.mock.calls.length;
    await loadAliasMap(pool);
    expect(query.mock.calls.length).toBe(before);
  });
});

describe("loadTranslationsByNoticeIds", () => {
  it("空 id 列表 → 零查询", async () => {
    const { pool, query } = makePool([]);
    expect((await loadTranslationsByNoticeIds(pool, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("原样返回译文与 model（不在此处做同语言回填，规则唯一在 buildWideRow）", async () => {
    const { pool } = makePool([
      [/crm_notice_translations/, [[
        { notice_id: 7, lang: "zh", title_tr: "标题", description_tr: null, model: "same-lang-passthrough" },
        { notice_id: 7, lang: "en", title_tr: "Title", description_tr: "Body", model: "dealy" },
      ]]],
    ]);
    const map = await loadTranslationsByNoticeIds(pool, [7]);
    expect(map.get(7)!.zh).toEqual({ title: "标题", description: "", model: "same-lang-passthrough" });
    expect(map.get(7)!.en.description).toBe("Body");
  });
});

describe("loadUnspscByNoticeIds", () => {
  // 骨架索引是进程内 TTL 缓存（载入实测十几秒），必须逐例失效：
  // 否则“载入失败”的例会被前一例装好的索引撑过，把降级分支测成永远跑不到
  beforeEach(() => resetBackboneCache());
  /** 与下方 backbone 例同一棵树：L1=UGT-01（段 10 ⇒ 大类 UGT-G-01）… L5=10101504。
   *  必须是工厂：makePool 用 .shift() 逐批发放，共用同一个数组会把后续例的树消费干净 */
  const TREE = () => [[
    { code: "UGT-01", parent_code: "", level: 1, unspsc_prefix: null, group_code: "UGT-G-01" },
    { code: "UGT-0101", parent_code: "UGT-01", level: 2, unspsc_prefix: null, group_code: "UGT-G-01" },
    { code: "UGT-010101", parent_code: "UGT-0101", level: 3, unspsc_prefix: null, group_code: "UGT-G-01" },
    { code: "UGT-01010101", parent_code: "UGT-010101", level: 4, unspsc_prefix: "101015", group_code: "UGT-G-01" },
    { code: "UGT-0101010101", parent_code: "UGT-01010101", level: 5, unspsc_prefix: "10101504", group_code: "UGT-G-01" },
  ]];

  it("空列表 → 零查询", async () => {
    const { pool, query } = makePool([]);
    expect((await loadUnspscByNoticeIds(pool, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("同一次取码里把 backbone_path 算出来（不另开查询）", async () => {
    const { pool, query } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[
        { notice_id: "N1", code: "10101504" },
        { notice_id: "N1", code: "10101504" },
      ]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadUnspscByNoticeIds(pool, [{ noticeId: "N1" }])).get("N1")!;
    expect(r.backbone).toBe("UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101");
    // 取码只一次；整树只查一条 SQL（段归属由树内存推导，退役后不再有第二张表，见 ADR-0009）
    const bridgeCalls = query.mock.calls.filter((c) => /crm_bid_notice_unspsc_codes/.test(String(c[0])));
    expect(bridgeCalls).toHaveLength(1);
    // 取树 SQL 绝不回读旧树
    for (const c of query.mock.calls) expect(String(c[0])).not.toContain("crm_commodity_nodes");
  });

  it("树载入失败 → backbone 落空串（由 buildWideRow 转 NULL，不拿旧字典 id 串补位）", async () => {
    const { pool } = makePool(
      [[/crm_bid_notice_unspsc_codes/, [[{ notice_id: "N1", code: "10101504" }]]]],
      /FROM crm_commodity_backbone/,
    );
    const r = (await loadUnspscByNoticeIds(pool, [{ noticeId: "N1" }])).get("N1")!;
    expect(r.backbone).toBe("");
  });

  it("★ D8：桥表无行但有主表自填分类 → 翻成 8 位码后走同一份挂靠规则", async () => {
    const { pool, query } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[]]], // 平台公告在桥表里没有行
      [/FROM crm_unspsc_codes WHERE id IN/, [[{ id: 999, code: "10000000" }]]], // 段级码（后 6 位全 0）
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadUnspscByNoticeIds(pool, [{ noticeId: "P1", categoryIds: [999, null] }])).get("P1")!;
    expect(r.backbone).toBe("UGT-01"); // 段级粗码只到大类一层（两位一组、下一组为 00 即停）
    const dictCalls = query.mock.calls.filter((c) => /FROM crm_unspsc_codes/.test(String(c[0])));
    expect(dictCalls).toHaveLength(1); // 整批一次 IN，绝不逐条点查
  });

  it("★ D8 边界：分类指向旧字典 level=1 字母容器（code 非 8 位）→ 留空不臆测", async () => {
    const { pool } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[]]],
      [/FROM crm_unspsc_codes WHERE id IN/, [[{ id: 109, code: "J" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadUnspscByNoticeIds(pool, [{ noticeId: "P2", categoryIds: [109] }])).get("P2")!;
    expect(r.backbone).toBe("");
  });

  it("有桥表码时仍合并平台自填分类（两者都可被筛到，同退役前的合并语义）", async () => {
    const { pool } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[{ notice_id: "N2", code: "10101504" }]]],
      [/FROM crm_unspsc_codes WHERE id IN/, [[{ id: 7, code: "10000000" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadUnspscByNoticeIds(pool, [{ noticeId: "N2", categoryIds: [7] }])).get("N2")!;
    expect(r.backbone).toContain("UGT-0101010101"); // 桥表码的完整链在
  });

  it("无自填分类的行不发字典查询（不为空数据多打一轮 SQL）", async () => {
    const { pool, query } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[{ notice_id: "N3", code: "10101504" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    await loadUnspscByNoticeIds(pool, [{ noticeId: "N3", categoryIds: [null, undefined] }]);
    expect(query.mock.calls.some((c) => /FROM crm_unspsc_codes/.test(String(c[0])))).toBe(false);
  });

  it("返回形状只有 backbone：不再携带任何旧字典五级 id", async () => {
    const { pool } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[{ notice_id: "N4", code: "10101504" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const r = (await loadUnspscByNoticeIds(pool, [{ noticeId: "N4" }])).get("N4")!;
    expect(Object.keys(r)).toEqual(["backbone"]);
  });

  it("整批只一次字典 IN：多个公告共用同一分类 id 也不逐行点查（MDL 纪律）", async () => {
    const { pool, query } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[]]],
      [/FROM crm_unspsc_codes WHERE id IN/, [[{ id: 999, code: "10000000" }, { id: 888, code: "10101504" }]]],
      [/FROM crm_commodity_backbone WHERE status = 1/, TREE()],
    ]);
    const m = await loadUnspscByNoticeIds(pool, [
      { noticeId: "P1", categoryIds: [999, 999] },
      { noticeId: "P2", categoryIds: [999] },
      { noticeId: "P3", categoryIds: [888] },
    ]);
    const dictCalls = query.mock.calls.filter((c) => /FROM crm_unspsc_codes/.test(String(c[0])));
    expect(dictCalls).toHaveLength(1);
    // 去重后只传两个 id（共用的 999 不重复占位）
    expect(dictCalls[0][1]).toEqual([999, 888]);
    expect(m.get("P1")!.backbone).toBe("UGT-01");
    expect(m.get("P2")!.backbone).toBe("UGT-01");
    expect(m.get("P3")!.backbone).toContain("UGT-0101010101");
  });
});

describe("detectDeadlineDrift", () => {
  it("返回不一致的 id，且只发 SELECT（不改宽表 —— I1）", async () => {
    const { pool, query } = makePool([
      [/ns\.deadline_sec !=/, [[{ id: 11 }, { id: 12 }, { id: null }]]],
    ]);
    expect(await detectDeadlineDrift(pool)).toEqual([11, 12]);
    expect(String(query.mock.calls[0][0])).toMatch(/^\s*SELECT/i);
  });

  it("30 分钟内同类日志不重复输出（对账每分钟跑一次，不得刷屏）", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const mk = () => makePool([[/ns\.deadline_sec !=/, [[{ id: 1 }]]]]);
      const a = mk();
      await detectDeadlineDrift(a.pool);
      const logsAfterFirst = log.mock.calls.length;
      const b = mk();
      await detectDeadlineDrift(b.pool);
      expect(b.query).toHaveBeenCalledTimes(1);
      // 第二次不再输出同类日志，但仍正常返回 id
      expect(log.mock.calls.length).toBe(logsAfterFirst);
    } finally {
      log.mockRestore();
    }
  });
});

describe("reconcileGhostRows", () => {
  it("分批删除宽表残留行并返回被删 id", async () => {
    const ghosts = Array.from({ length: 3 }, (_, i) => ({ id: i + 1 }));
    const { pool, query } = makePool([
      [/SELECT ns\.id FROM crm_notice_search ns/, [ghosts]],
    ]);
    expect(await reconcileGhostRows(pool)).toEqual([1, 2, 3]);
    const deletes = query.mock.calls.filter((c) => /DELETE FROM crm_notice_search/i.test(String(c[0])));
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toEqual([1, 2, 3]);
  });

  it("查询异常 → 静默降级返回已收集 id（不阻断对账定时器）", async () => {
    const { pool } = makePool([], /SELECT ns\.id FROM crm_notice_search ns/);
    expect(await reconcileGhostRows(pool)).toEqual([]);
  });
});
