/**
 * 行业偏好仓储 — SQL 契约测试（码版）
 *
 * 钉住的是「行业墙的数据源不能被写漏」这一件事：
 * 1. 读侧必须把 `commodity_code` 取回来 ——
 *    墙判定的大类（L1 码）由它前缀推导，读不到这列就等于墙没有输入；
 * 2. 写侧必须落 `commodity_code`（INSERT 列清单 + ON DUPLICATE 更新分支都要有），
 *    漏了就是「第一次保存有值、改一次偏好就丢」，而且不会报错；
 *    （group_code 列已随 G 码退役 2026-10-15 删除，大类由码前缀推导、不再落库）
 * 3. 旧的 levelN_id（旧品类字典行 id）在 INSERT 与 ODKU 两侧都显式置 NULL ——
 *    「新码旧 id」两套键并存就是分叉温床。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPrefsRepo } from "@/lib/repos/user-prefs.repo";

describe("UserPrefsRepo 行业偏好的选择键列", () => {
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

  it("getIndustryPrefs：SELECT 里必须带 commodity_code，且不再读 group_code", async () => {
    await repo.getIndustryPrefs(42);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("commodity_code");
    expect(sql).not.toContain("group_code");
    expect(params).toEqual([42]);
  });

  it("upsertIndustryPrefs：INSERT 与 ODKU 两边都写 commodity_code（levelN_id 五列已随死列 DROP）", async () => {
    await repo.upsertIndustryPrefs(42, "UGT-070201");
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    const insertPart = sql.slice(0, sql.indexOf("ON DUPLICATE"));
    const updatePart = sql.slice(sql.indexOf("ON DUPLICATE"));
    expect(insertPart).toContain("commodity_code");
    expect(insertPart).not.toContain("group_code");
    expect(sql).not.toContain("level1_id");
    expect(updatePart).toContain("commodity_code = VALUES(commodity_code)");
    // 占位符个数与参数个数必须一一对应（少一个就把用户 id 写进权益列那一类错）
    expect((sql.match(/\?/g) || []).length).toBe(params.length);
    expect(params).toEqual([42, "UGT-070201"]);
  });

  it("整条 SQL 不再出现 group_code（G 码退役后大类不落库）", async () => {
    await repo.upsertIndustryPrefs(42, null);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("group_code");
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
