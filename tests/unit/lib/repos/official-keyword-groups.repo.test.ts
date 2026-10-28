/**
 * OfficialKeywordGroupsRepo 单测 —— 官方精选词组只读数据访问层
 *
 * 覆盖：
 *  1) listEnabled：只查 status=1、(sort_order,id) 升序，SQL 形状与 camelCase mapper
 *     （JSON 字符串列 / 已解析数组两形态都要吃下）
 *  2) isOfficialName：trim 后精确匹配（绑定参数走 ?，命中/未命中两分支）
 */
import { describe, it, expect, vi } from "vitest";
import { OfficialKeywordGroupsRepo } from "@/lib/repos/official-keyword-groups.repo";

const makePool = (rows: unknown[]) => {
  const query = vi.fn().mockResolvedValue([rows]);
  return { pool: { query } as never, query };
};

describe("OfficialKeywordGroupsRepo", () => {
  it("listEnabled：只查上架行，按 sort_order,id 升序，mapper 出 camelCase", async () => {
    // fixture 即 DB 按 ORDER BY 返回的形状（repo 不二次排序，只验保序 + 转换）
    const { pool, query } = makePool([
      { id: 1, name: "医疗", terms: ["手术"], category_code: null, sort_order: 0 },
      { id: 2, name: "光伏", terms: '["光伏","组件"]', category_code: "energy", sort_order: 1 },
    ]);
    const out = await new OfficialKeywordGroupsRepo(pool).listEnabled();
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("FROM official_keyword_groups");
    expect(sql).toContain("`status` = 1");
    expect(sql).toContain("ORDER BY sort_order ASC, id ASC");
    expect(out[0]).toEqual({ id: 1, name: "医疗", terms: ["手术"], categoryCode: null, sortOrder: 0 });
    expect(out[1].terms).toEqual(["光伏", "组件"]); // JSON 字符串列自动解析
  });

  it("isOfficialName：trim 后精确匹配，命中返回 true、未命中返回 false", async () => {
    const { pool, query } = makePool([{ hit: 1 }]);
    await expect(new OfficialKeywordGroupsRepo(pool).isOfficialName(" 光伏 ")).resolves.toBe(true);
    expect(String(query.mock.calls[0][0])).toContain("`name` = ?");
    expect(query.mock.calls[0][1]).toEqual(["光伏"]); // 入参 trim 后再查（口径同 validateGroupInput）
    const empty = makePool([]);
    await expect(new OfficialKeywordGroupsRepo(empty.pool).isOfficialName("不存在")).resolves.toBe(false);
  });
});
