/**
 * mysql-fallback buildOrderBy 单元测试
 * 重点：用户搜索词拼入 ORDER BY 字符串字面量前的转义（P0-1 修复回归）
 * —— 必须先转义反斜杠再转义单引号，防止字面量被破坏 / ORDER BY 注入
 */
import { describe, it, expect } from "vitest";
import { buildOrderBy } from "@/lib/services/search-orchestrator/mysql-fallback";
import type { UnifiedSearchParams } from "@/lib/services/search-orchestrator/types";

function makeParams(q: string, sort?: UnifiedSearchParams["sort"]): UnifiedSearchParams {
  return {
    q,
    sort,
    page: 1,
    pageSize: 10,
  } as unknown as UnifiedSearchParams;
}

describe("buildOrderBy 搜索词转义", () => {
  it("普通关键词：包含 refBoost 且单引号被成对转义", () => {
    const sql = buildOrderBy(makeParams("RFQ-2026'X"));
    expect(sql).toContain("'RFQ-2026''X'");
    expect(sql.startsWith("(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = '")).toBe(true);
    expect(sql).toContain(") DESC,");
  });

  it("反斜杠关键词：字面量必须保持闭合且反斜杠被双写", () => {
    const sql = buildOrderBy(makeParams("abc\\"));
    // abc\ → abc\\ ，随后的引号不能被反斜杠吃掉
    expect(sql).toContain("= 'ABC\\\\'");
    expect(sql).toContain("') DESC,");
  });

  it("反斜杠+单引号组合（经典注入 payload）：不得逃逸出字面量", () => {
    const sql = buildOrderBy(makeParams("\\', (SELECT 1),#"));
    // 所有 \ 翻倍后，payload 无法提前闭合字符串
    expect(sql).toContain("= '\\\\''");
    expect(sql).toContain("') DESC,");
    expect(sql).not.toContain("= '\\''");
  });

  it("空白被移除并统一大写", () => {
    const sql = buildOrderBy(makeParams(" rfq 2026 "));
    expect(sql).toContain("'RFQ2026'");
  });

  it("sort=latest：无 q 时不应有 refBoost", () => {
    const sql = buildOrderBy(makeParams("", "latest"));
    expect(sql).not.toContain("DESC, ");
    expect(sql).toBe("n.id DESC");
  });

  it("sort=deadline：保留 deadline_sec 升序语义", () => {
    const sql = buildOrderBy(makeParams("abc", "deadline"));
    expect(sql).toContain("(n.deadline_sec = 0) ASC");
    expect(sql).toContain("n.deadline_sec ASC");
  });
});
