/**
 * 降级关键词谓词（服务表白名单列 LIKE）
 *
 * 2026-11-18 收口：降级不再读主表 bid_notices / notice_translations（无 FULLTEXT 可用），
 * 改为对 notice_search 的 title/reference/description/title_zh/description_zh 做 LIKE 子串匹配。
 * 钉住的不变量：
 * 1. 每个词命中 5 列任一（OR）；词之间按 matchMode 组合（all=AND，any=OR）；
 * 2. 排除词对 5 列全部 NOT LIKE（AND），否则会把含排除词的文档放进来；
 * 3. 纯排除查询不产出正向分支；空查询产出空 sql（调用方直接返回空集）。
 */
import { describe, it, expect } from "vitest";
import { buildKeywordWhere } from "@/lib/services/search-orchestrator/mysql-fallback";

const COLS = ["title", "reference", "description", "title_zh", "description_zh"];
const POS = `(${COLS.map((c) => `s.${c} LIKE ?`).join(" OR ")})`;
const NEG = `(${COLS.map((c) => `s.${c} NOT LIKE ?`).join(" AND ")})`;

describe("buildKeywordWhere", () => {
  it("单词：命中 5 列任一，参数为 5 个 %词%", () => {
    const { sql, params } = buildKeywordWhere("solar");
    expect(sql).toBe(POS);
    expect(params).toEqual(Array(5).fill("%solar%"));
  });

  it("多词 all：逐词 AND（与 Meili matchingStrategy=all 同源）", () => {
    const { sql, params } = buildKeywordWhere("solar pump");
    expect(sql).toBe(`${POS} AND ${POS}`);
    expect(params).toEqual([...Array(5).fill("%solar%"), ...Array(5).fill("%pump%")]);
  });

  it("多词 any：逐词 OR", () => {
    const { sql } = buildKeywordWhere("solar pump", "any");
    expect(sql).toBe(`${POS} OR ${POS}`);
  });

  it("不传第二参等价于 all", () => {
    expect(buildKeywordWhere("医疗 建筑")).toEqual(buildKeywordWhere("医疗 建筑", "all"));
  });

  it("排除词：5 列全部 NOT LIKE，并与包含词 AND", () => {
    const { sql, params } = buildKeywordWhere("solar -battery");
    expect(sql).toBe(`(${POS}) AND (${NEG})`);
    expect(params).toEqual([...Array(5).fill("%solar%"), ...Array(5).fill("%battery%")]);
  });

  it("纯排除词：只有负向分支", () => {
    const { sql, params } = buildKeywordWhere("-battery");
    expect(sql).toBe(`(${NEG})`);
    expect(sql).not.toContain("LIKE ? OR");
    expect(params).toEqual(Array(5).fill("%battery%"));
  });

  it("空查询：返回空 sql（调用方直接给空集，不拼出恒真谓词）", () => {
    expect(buildKeywordWhere("   ")).toEqual({ sql: "", params: [] });
  });

  it("LIKE 通配符被转义，% 与 _ 不当通配使用", () => {
    const { params } = buildKeywordWhere("50%_off", "all");
    expect(params[0]).toBe("%50\\%\\_off%");
  });
});