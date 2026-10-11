/**
 * 行业偏好仓储 — SQL 契约测试
 *
 * 钉住的是「行业墙的数据源不能被写漏」这一件事：
 * 1. 读侧必须把 `group_code` 一起取回来 —— 墙判定改读大类码后，读不到这列就等于墙没有输入；
 * 2. 写侧必须同时落 `group_code`（INSERT 列清单 + ON DUPLICATE 更新分支都要有），
 *    漏了任何一个都是「第一次保存有值、改一次偏好就丢」，而且不会报错；
 * 3. 换不出大类码时如实写 NULL：仓储不猜、不回填旧值（错值比空值难发现得多）。
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

  it("getIndustryPrefs：SELECT 里必须带 group_code", async () => {
    await repo.getIndustryPrefs(42);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("group_code");
    expect(sql).not.toContain("commodity_code"); // 本批只补大类码，品目节点码另批做
    expect(params).toEqual([42]);
  });

  it("upsertIndustryPrefs：INSERT 列清单与 ON DUPLICATE 两边都写 group_code", async () => {
    await repo.upsertIndustryPrefs(42, [101, 100432, null, null, null], "UGT-G-07");
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    const insertPart = sql.slice(0, sql.indexOf("ON DUPLICATE"));
    const updatePart = sql.slice(sql.indexOf("ON DUPLICATE"));
    expect(insertPart).toContain("group_code");
    expect(updatePart).toContain("group_code = VALUES(group_code)");
    // 占位符个数与参数个数必须一一对应（少一个就把用户 id 写进权益列那一类错）
    expect((sql.match(/\?/g) || []).length).toBe(params.length);
    expect(params).toEqual([42, 101, 100432, null, null, null, "UGT-G-07"]);
  });

  it("换不出大类码就写 NULL：不拿上一次的值兜底、不填占位串", async () => {
    await repo.upsertIndustryPrefs(42, [101, null, null, null, null], null);
    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBeNull();
  });

  it("deleteIndustryPrefs 仍按 user_id 精确删", async () => {
    await repo.deleteIndustryPrefs(42);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("DELETE FROM crm_user_industry_prefs WHERE user_id = ?");
    expect(params).toEqual([42]);
  });
});
