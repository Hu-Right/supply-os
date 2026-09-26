import { describe, it, expect } from "vitest";
import { buildKeywordUnion } from "@/lib/services/search-orchestrator/mysql-fallback";

describe("buildKeywordUnion", () => {
  it("普通英文词：SQL 形状与现网一致（三路 FULLTEXT UNION）", () => {
    const { sql, params } = buildKeywordUnion("solar");
    expect(sql).toContain("MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)");
    expect(sql).toContain("MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)");
    expect(params).toEqual(["solar", "solar", "solar"]);
  });
  it("带排除词：BOOLEAN 分支吃 +/- 语法，译文分支补 NOT LIKE", () => {
    const { sql, params } = buildKeywordUnion("solar -battery");
    expect(sql).toContain("AGAINST(? IN BOOLEAN MODE)");
    expect(sql).toContain("NOT LIKE");
    // boolean 串 + 每个正/负 token 两次（title/description）
    expect(params[0]).toBe("+solar -battery");
    expect(params.filter((p) => p === "%battery%")).toHaveLength(2);
  });
  it("中文 + 排除词：译文分支按排除词 NOT LIKE", () => {
    const { params } = buildKeywordUnion("光伏 -电池");
    expect(params[0]).toBe("+光伏 -电池");
    expect(params).toContain("%电池%");
  });
  it("纯排除词：无正向 LIKE 分支", () => {
    const { sql, params } = buildKeywordUnion("-battery");
    expect(params[0]).toBe("-battery");
    expect(sql).not.toContain("LIKE");
    expect(params).toEqual(["-battery"]);
  });
});
