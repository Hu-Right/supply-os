/**
 * 宽表数据加载与对账检测层覆盖（红线 #6 相关模块纳入覆盖率白名单的前置）
 *
 * 这些函数都是 DB 侧批处理：mocked pool 按 SQL 内容分派返回批次，
 * 断言的是「多行归并/去重/失败降级/缓存复用」这些真实会静默改变搜索结果的分支。
 * 模块级缓存（别名表 / 精准码字典）会跨用例存活，因此失败路径必须先于成功路径执行。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import {
  loadAliasMap, loadTranslationsByNoticeIds, loadUnspscByNoticeIds,
  loadPreciseByNoticeIds, buildCodeLevelMap,
} from "@/lib/services/search-sync/wide-row-builder";
import { detectDeadlineDrift, reconcileGhostRows } from "@/lib/services/search-sync/wide-row-reconcile";

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
  it("空列表 → 零查询", async () => {
    const { pool, query } = makePool([]);
    expect((await loadUnspscByNoticeIds(pool, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("同一公告多行按层级去重合并为逗号串", async () => {
    const { pool } = makePool([
      [/crm_bid_notice_unspsc_codes/, [[
        { notice_id: "N1", level1_id: "10", level2_id: "20", level3_id: null, level4_id: "40", level5_id: "" },
        { notice_id: "N1", level1_id: "10", level2_id: "21", level3_id: "30", level4_id: null, level5_id: "50" },
      ]]],
    ]);
    const m = await loadUnspscByNoticeIds(pool, ["N1"]);
    const r = m.get("N1")!;
    expect(r.level1).toBe("10");
    expect(r.level2.split(",").sort()).toEqual(["20", "21"]);
    expect(r.level3).toBe("30");
    expect(r.level4).toBe("40");
    expect(r.level5).toBe("50");
  });
});

describe("buildCodeLevelMap", () => {
  it("跳过空 code，其余按 code→五级 id 建映射", () => {
    const map = buildCodeLevelMap([
      { code: "  ", l1: "1", l2: "2", l3: "3", l4: "4", l5: "5" },
      { code: "10101500", l1: "10", l2: "1010", l3: "101015", l4: "10101500", l5: "10101500" },
    ] as never);
    expect(map.size).toBe(1);
    expect(map.get("10101500")!.level1).toBe("10");
  });
});

describe("loadPreciseByNoticeIds", () => {
  it("命中字典的码解析为五级 ID 并去重；未命中字典的码被跳过", async () => {
    const { pool } = makePool([
      [/crm_bid_opportunity_unspsc_candidates/, [[
        { notice_id: "N3", candidate_code: "10101500" },
        { notice_id: "N3", candidate_code: "10101500" },
        { notice_id: "N3", candidate_code: "99999999" },
      ]]],
      [/u5\.level = 5/, [[
        { code: "10101500", l5: "500", l4: "400", l3: "300", l2: "200", l1: "100" },
      ]]],
    ]);
    const m = await loadPreciseByNoticeIds(pool, ["N3"]);
    expect(m.get("N3")).toEqual({ level1: "100", level2: "200", level3: "300", level4: "400", level5: "500" });
  });

  it("空列表 → 零查询", async () => {
    const { pool, query } = makePool([]);
    expect((await loadPreciseByNoticeIds(pool, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("命中字典的码解析为五级 ID 并去重；未命中字典的码被跳过", async () => {
    const { pool } = makePool([
      [/crm_bid_opportunity_unspsc_candidates/, [[
        { notice_id: "N3", candidate_code: "10101500" },
        { notice_id: "N3", candidate_code: "10101500" },
        { notice_id: "N3", candidate_code: "99999999" },
      ]]],
      [/u5\.level = 5/, [[
        { code: "10101500", l5: "500", l4: "400", l3: "300", l2: "200", l1: "100" },
      ]]],
    ]);
    const m = await loadPreciseByNoticeIds(pool, ["N3"]);
    expect(m.get("N3")).toEqual({ level1: "100", level2: "200", level3: "300", level4: "400", level5: "500" });
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
