/**
 * 宽表同步 SQL 片段单一口径（I2）
 *
 * 断言：JOIN / 翻译加载 JOIN 的机会表合格判定谓词，与精选逻辑 featured.ts 的
 *      qualifiedOppWhere 逐字一致 —— 否则「精选详情页看到的描述」与
 *      「搜索索引里的描述」会取自不同的机会行（口径分叉）。
 */
import { describe, it, expect } from "vitest";
import { WIDE_SYNC_JOIN, WIDE_OPP_JOIN } from "@/lib/services/search-sync/wide-row-builder";
import { qualifiedOppWhere, FEATURED_NOTICE_EXISTS } from "@/lib/services/notices/featured";
import { DESC_SOURCE_EXPR } from "@/lib/utils/notice-field-limits";

describe("宽表同步 SQL 口径", () => {
  it("JOIN 复用 qualifiedOppWhere('opp')，不再内联三条件", () => {
    expect(WIDE_OPP_JOIN).toContain(qualifiedOppWhere("opp"));
    expect(WIDE_SYNC_JOIN).toContain(WIDE_OPP_JOIN);
  });

  it("宽表 JOIN 与精选判定由同一函数派生（跨模块不分叉的直接证据）", () => {
    expect(FEATURED_NOTICE_EXISTS).toContain(qualifiedOppWhere("o1"));
    expect(FEATURED_NOTICE_EXISTS).toContain(qualifiedOppWhere("o2"));
  });

  it("JOIN 与描述源表达式使用同一 opp 别名", () => {
    expect(DESC_SOURCE_EXPR).toContain("opp.description");
    expect(WIDE_OPP_JOIN).toContain("opp ON");
  });

  it("机会行过滤条件挂在 JOIN 的 ON 上而非 WHERE（左连接不得退化为内连接）", () => {
    expect(WIDE_OPP_JOIN).toMatch(/LEFT JOIN crm_bid_opportunities opp ON[\s\S]*AND/);
    expect(WIDE_OPP_JOIN).not.toMatch(/\bWHERE\b/);
  });
});
