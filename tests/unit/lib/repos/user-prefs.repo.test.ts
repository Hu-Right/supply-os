/**
 * 行业偏好仓储 — SQL 契约测试（码版）
 *
 * 钉住的是「行业墙的数据源不能被写漏」这一件事：
 * 1. 读侧必须把 `group_code` 与 `commodity_code` 一起取回来 ——
 *    墙判定改读大类码后，读不到这列就等于墙没有输入；码版偏好的选择键是节点码；
 * 2. 写侧必须同时落 `group_code` + `commodity_code`（INSERT 列清单 + ON DUPLICATE 更新分支都要有），
 *    漏了任何一个都是「第一次保存有值、改一次偏好就丢」，而且不会报错；
 * 3. 旧的 levelN_id（旧品类字典行 id）在 INSERT 与 ODKU 两侧都显式置 NULL ——
 *    「新码旧 id」两套键并存就是分叉温床；
 * 4. 换不出大类码时如实写 NULL：仓储不猜、不回填旧值（错值比空值难发现得多）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPrefsRepo } from "@/lib/repos/user-prefs.repo";

describe("UserPrefsRepo 行业偏好的大类码列", () => {
  const mockQuery = vi.fn();
  const mockExecute = vi.fn();
  const pool = { query: mockQuery, execute: mockExecute } as never;
  let repo: UserPrefsRepo;

  beforeEach(() => {
    repo = new UserPrefsRepo(pool);
    mockQuery.mockReset();
    mockExecute.mockReset();
    mockQuery.mockResolvedValue([[]]);
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it("getIndustryPrefs：SELECT 里必须带 group_code 与 commodity_code", async () => {
    await repo.getIndustryPrefs(42);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("group_code");
    expect(sql).toContain("commodity_code");
    expect(params).toEqual([42]);
  });

  it("upsertIndustryPrefs：INSERT 与 ODKU 两边都写 group_code + commodity_code，且旧行 id 置 NULL", async () => {
    await repo.upsertIndustryPrefs(42, "UGT-070201", "UGT-G-07");
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    const insertPart = sql.slice(0, sql.indexOf("ON DUPLICATE"));
    const updatePart = sql.slice(sql.indexOf("ON DUPLICATE"));
    expect(insertPart).toContain("group_code");
    expect(insertPart).toContain("commodity_code");
    expect(updatePart).toContain("group_code = VALUES(group_code)");
    expect(updatePart).toContain("commodity_code = VALUES(commodity_code)");
    expect(updatePart).toContain("level1_id = NULL");
    // 占位符个数与参数个数必须一一对应（少一个就把用户 id 写进权益列那一类错）
    expect((sql.match(/\?/g) || []).length).toBe(params.length);
    expect(params).toEqual([42, "UGT-G-07", "UGT-070201"]);
  });

  it("换不出大类码就写 NULL：不拿上一次的值兜底、不填占位串", async () => {
    await repo.upsertIndustryPrefs(42, "UGT-070201", null);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    // 不兜底的形状：UPDATE 分支直取 VALUES(group_code)（参数为 NULL 即落 NULL），
    // 不许出现 IFNULL/COALESCE 回读旧值，也不许在 JS 侧拼占位串
    expect(sql).not.toMatch(/IFNULL|COALESCE/i);
    expect(params).toContainEqual(null);
  });

  it("deleteIndustryPrefs 仍按 user_id 精确删", async () => {
    await repo.deleteIndustryPrefs(42);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("DELETE FROM crm_user_industry_prefs WHERE user_id = ?");
    expect(params).toEqual([42]);
  });
});
