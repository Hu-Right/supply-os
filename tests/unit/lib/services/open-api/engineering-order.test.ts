import { describe, expect, it, vi } from "vitest";
import { queryEngineeringList } from "@/lib/services/open-api/engineering";

/** 最小 mock：第 1 次查询返回 COUNT，其余返回列表行；顺带记录所有 SQL */
function makePool() {
  const sqls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    sqls.push(String(sql));
    const isCount = /COUNT\(\*\)/i.test(String(sql));
    return isCount ? [[{ total: 0 }]] : [[{ id: 1 }]];
  });
  return { pool: { query } as never, sqls };
}

describe("queryEngineeringList 排序口径", () => {
  it("按 create_time 倒序，不再用脏字符串 published_date 排序（回归：乱序 bug）", async () => {
    const { pool, sqls } = makePool();
    await queryEngineeringList(pool, { page: 1, limit: 10 } as never, "basic");

    const listSql = sqls.find((s) => /ORDER BY/i.test(s)) ?? "";
    expect(listSql).toContain("ORDER BY o.create_time DESC");
    expect(listSql).not.toMatch(/ORDER BY o\.published_date/);
  });
});
