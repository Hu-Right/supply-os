/**
 * 宽表源指纹表达式形状不变量（I1）
 *
 * 指纹只允许依赖「构建宽表时真正读过的输入」，且不得依赖宽表自身当前值 ——
 * 这是「修复后必然收敛」的前提。测试锁定的是这些依赖边界，而非 MD5 结果值。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { WIDE_FP_EXPR, FP_SLICE_SIZE, FP_SLICES_PER_ROUND } from "@/lib/services/search-sync/wide-fingerprint";
import { DESC_SOURCE_EXPR, WIDE_LIMITS } from "@/lib/utils/notice-field-limits";

describe("WIDE_FP_EXPR", () => {
  it("覆盖宽表内容构建读过的全部主表字段", () => {
    for (const col of ["n.title", "n.reference", "n.notice_id", "n.country", "n.agency",
      "n.notice_type", "n.deadline_sec", "n.is_featured", "n.estimated_value",
      "n.published_date", "n.entry_source", "n.rfq_status"]) {
      expect(WIDE_FP_EXPR, col).toContain(col);
    }
  });

  it("描述来源复用 DESC_SOURCE_EXPR（机会表优先），与宽表同一口径", () => {
    expect(WIDE_FP_EXPR).toContain(DESC_SOURCE_EXPR);
  });

  it("机会表展示列与三张输入表聚合均在指纹内", () => {
    expect(WIDE_FP_EXPR).toContain("opp.description_cn");
    expect(WIDE_FP_EXPR).toContain("opp.bid_overview");
    expect(WIDE_FP_EXPR).toContain("opp.beneficiary_countries");
    expect(WIDE_FP_EXPR).toContain("crm_bid_notice_unspsc_codes");
    expect(WIDE_FP_EXPR).toContain("crm_notice_translations");
    expect(WIDE_FP_EXPR).toContain("crm_bid_opportunity_unspsc_candidates");
  });

  it("平台自填分类列在指纹内（分类变更须触发重建）", () => {
    expect(WIDE_FP_EXPR).toContain("n.category_l1_id");
    expect(WIDE_FP_EXPR).toContain("n.category_l2_id");
  });

  it("禁止 GROUP_CONCAT（默认 1024 字节截断会漏检变更）", () => {
    expect(WIDE_FP_EXPR).not.toMatch(/GROUP_CONCAT/i);
  });

  it("不引用宽表列（否则指纹随修复结果自反馈，永不收敛）", () => {
    expect(WIDE_FP_EXPR).not.toMatch(/crm_notice_search|ns\./);
  });

  it("长度全部来自 WIDE_LIMITS 常量", () => {
    expect(WIDE_FP_EXPR).toContain(String(WIDE_LIMITS.title));
    expect(WIDE_FP_EXPR).toContain(String(WIDE_LIMITS.description));
  });

  it("以 MD5 包裹且为单表达式（可直接拼进 SELECT 列表）", () => {
    expect(WIDE_FP_EXPR.startsWith("MD5(")).toBe(true);
    expect(WIDE_FP_EXPR).not.toContain(";");
  });

  it("括号配平（不配平只在连库时才爆，此处提前拦截）", () => {
    let depth = 0;
    let min = 0;
    for (const c of WIDE_FP_EXPR) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      if (depth < min) min = depth;
    }
    expect(min, "出现多余右括号").toBe(0);
    expect(depth, "括号未配平").toBe(0);
  });

  it("切片参数为正整数（对账轮转成本上限）", () => {
    expect(FP_SLICE_SIZE).toBeGreaterThan(0);
    expect(FP_SLICES_PER_ROUND).toBeGreaterThan(0);
  });
});

describe("detectWideFingerprintDrift", () => {
  /**
   * 窗口算法契约：先取窗口边界（成本恒定），再在窗口内比较指纹。
   * 游标存于模块内，用 resetModules 保证用例互不干扰。
   */
  it("返回差异 id，游标逐轮推进，到表尾归零", async () => {
    vi.resetModules();
    const mod = await import("@/lib/services/search-sync/wide-fingerprint");

    const windows: Array<Array<Record<string, unknown>>> = [
      [{ lo: 100, hi: 900 }], // 第一轮窗口
      [],                     // 第二轮：无更大行 → 游标归零并结束
      [{ lo: 5, hi: 9 }],     // 第三次调用：应从头开始
    ];
    const drift: Array<Array<Record<string, unknown>>> = [[{ id: 120 }, { id: 300 }]];
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: unknown = null) => {
      const s = String(sql);
      calls.push({ sql: s, params: params as unknown[] });
      // 列存在性探测（降级开关）必须先回答“有”，否则检测直接返回空
      if (/INNODB_TABLES|INFORMATION_SCHEMA\.COLUMNS/i.test(s)) return [[{ total: 1 }]];
      if (/MIN\(id\) AS lo/.test(s)) return [windows.shift() ?? []];
      if (/BETWEEN \? AND \?/.test(s)) return [drift.shift() ?? []];
      return [[]];
    });
    const pool = { query } as unknown as Pool;

    expect(await mod.detectWideFingerprintDrift(pool)).toEqual([120, 300]);
    const winParams = () =>
      calls.filter((c) => /MIN\(id\) AS lo/.test(c.sql)).map((c) => c.params[0]);
    // 第一轮从 0 开始，第二轮接上一窗口上界
    expect(winParams()).toEqual([0, 900]);

    // 表尾已至 → 游标归零，下一次从头清扫
    expect(await mod.detectWideFingerprintDrift(pool)).toEqual([]);
    expect(winParams()).toEqual([0, 900, 0, 9]);
  });

  it("只发 SELECT（对账不修复宽表 —— I1）", async () => {
    vi.resetModules();
    const mod = await import("@/lib/services/search-sync/wide-fingerprint");
    const query = vi.fn(async (sql: string) => [
      /INFORMATION_SCHEMA\.COLUMNS/i.test(String(sql))
        ? [{ total: 1 }]
        : String(sql).includes("MIN(id)")
          ? [{ lo: 1, hi: 2 }]
          : [],
    ]);
    await mod.detectWideFingerprintDrift({ query } as unknown as Pool);
    for (const c of query.mock.calls) {
      expect(/^\s*SELECT/i.test(String(c[0]))).toBe(true);
    }
  });

  /**
   * 降级开关：迁移 087 要在生产维护窗口才能执行，列不存在时
   * 不得发出任何引用该列的查询（否则整轮对账报错，被外层 catch 吞成 warning）。
   */
  it("指纹列缺失时直接返回空且不发出任何漂移查询", async () => {
    vi.resetModules();
    const mod = await import("@/lib/services/search-sync/wide-fingerprint");
    const query = vi.fn(async (_sql: string) => [[{ total: 0 }]]);
    const pool = { query } as unknown as Pool;

    expect(await mod.detectWideFingerprintDrift(pool)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/INFORMATION_SCHEMA\.COLUMNS/i);

    // 探测结果被缓存：第二次不再查库
    expect(await mod.detectWideFingerprintDrift(pool)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);

    // 列存在时正常进入窗口查询（每轮 2 个切片：第一个窗口有差异，第二个为空）
    mod.__resetFingerprintColumnCache();
    let windowsLeft = 1;
    const query2 = vi.fn(async (sql: string) => [
      /INFORMATION_SCHEMA\.COLUMNS/i.test(String(sql))
        ? [{ total: 1 }]
        : String(sql).includes("MIN(id)")
          ? (windowsLeft-- > 0 ? [{ lo: 1, hi: 9 }] : [])
          : [{ id: 5 }],
    ]);
    expect(await mod.detectWideFingerprintDrift({ query: query2 } as unknown as Pool)).toEqual([5]);
  });
});
