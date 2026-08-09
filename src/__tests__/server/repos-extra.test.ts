// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { AdminRepo } from "../../../server/repos/admin.repo";
import { CatalogRepo } from "../../../server/repos/catalog.repo";
import { UserPrefsRepo } from "../../../server/repos/user-prefs.repo";
import { TrainingRepo } from "../../../server/repos/training.repo";

/**
 * mock mysql2 pool：query/execute 均返回 [rows]（mysql2 解构约定）。
 */
function createPool(queryResults: any[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const rows = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([rows]);
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  } as any;
}

// ─── AdminRepo ─────────────────────────────────────────────────────────────
describe("AdminRepo", () => {
  it("listQualitySnapshots returns rows ordered by date desc", async () => {
    const snapshots = [
      { snapshot_date: "2026-08-01", total_notices: 1000 },
      { snapshot_date: "2026-07-31", total_notices: 990 },
    ];
    const pool = createPool([snapshots]);
    const repo = new AdminRepo(pool);
    const rows = await repo.listQualitySnapshots(7);
    expect(rows).toHaveLength(2);
    expect(rows[0].snapshot_date).toBe("2026-08-01");
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
    expect(String(pool.query.mock.calls[0][0])).toContain("ORDER BY snapshot_date DESC");
  });

  it("countAmountBackfillRemaining returns remaining count", async () => {
    const pool = createPool([[{ remaining: 42 }]]);
    const repo = new AdminRepo(pool);
    const count = await repo.countAmountBackfillRemaining(3);
    expect(count).toBe(42);
    expect(pool.query.mock.calls[0][1]).toEqual([3]);
  });

  it("countAmountBackfillRemaining defaults to 0 when empty", async () => {
    const pool = createPool([[]]);
    const repo = new AdminRepo(pool);
    const count = await repo.countAmountBackfillRemaining(1);
    expect(count).toBe(0);
  });

  it("getViewRollupStats returns rows_total and latest_day", async () => {
    const pool = createPool([[{ rows_total: 500, latest_day: "2026-08-01" }]]);
    const repo = new AdminRepo(pool);
    const stats = await repo.getViewRollupStats();
    expect(stats.rows_total).toBe(500);
    expect(stats.latest_day).toBe("2026-08-01");
  });

  it("getViewRollupStats defaults to null latest_day", async () => {
    const pool = createPool([[]]);
    const repo = new AdminRepo(pool);
    const stats = await repo.getViewRollupStats();
    expect(stats.rows_total).toBe(0);
    expect(stats.latest_day).toBeNull();
  });

  it("listRecoAbMetrics returns rows grouped by variant", async () => {
    const metrics = [
      { variant: "control", users: 100, impressions: 500, clicks: 50, ctr: 0.1 },
      { variant: "treatment", users: 100, impressions: 500, clicks: 60, ctr: 0.12 },
    ];
    const pool = createPool([metrics]);
    const repo = new AdminRepo(pool);
    const rows = await repo.listRecoAbMetrics(30);
    expect(rows).toHaveLength(2);
    expect(rows[1].variant).toBe("treatment");
    expect(pool.query.mock.calls[0][1]).toEqual([30]);
  });

  it("listExistingTables returns a Set of existing table names", async () => {
    const pool = createPool([[{ table_name: "crm_bid_notices" }, { table_name: "crm_users" }]]);
    const repo = new AdminRepo(pool);
    const tables = await repo.listExistingTables(["crm_bid_notices", "crm_users", "nonexistent"]);
    expect(tables).toBeInstanceOf(Set);
    expect(tables.has("crm_bid_notices")).toBe(true);
    expect(tables.has("crm_users")).toBe(true);
    expect(tables.has("nonexistent")).toBe(false);
  });

  it("listTableColumns returns a Map of table → column sets", async () => {
    const pool = createPool([[
      { table_name: "crm_users", column_name: "id" },
      { table_name: "crm_users", column_name: "email" },
      { table_name: "crm_bid_notices", column_name: "id" },
    ]]);
    const repo = new AdminRepo(pool);
    const columns = await repo.listTableColumns(["crm_users", "crm_bid_notices"]);
    expect(columns).toBeInstanceOf(Map);
    expect(columns.get("crm_users")!.has("id")).toBe(true);
    expect(columns.get("crm_users")!.has("email")).toBe(true);
    expect(columns.get("crm_bid_notices")!.has("id")).toBe(true);
  });

  it("countTableRows returns the row count", async () => {
    const pool = createPool([[{ total: 12345 }]]);
    const repo = new AdminRepo(pool);
    const count = await repo.countTableRows("crm_bid_notices");
    expect(count).toBe(12345);
    expect(pool.query.mock.calls[0][0]).toContain("crm_bid_notices");
  });

  it("countTableRows defaults to 0 when empty", async () => {
    const pool = createPool([[]]);
    const repo = new AdminRepo(pool);
    const count = await repo.countTableRows("empty_table");
    expect(count).toBe(0);
  });
});

// ─── CatalogRepo ───────────────────────────────────────────────────────────
describe("CatalogRepo", () => {
  it("listActiveCertifications returns only active certs", async () => {
    const certs = [{ id: 1, name: "ISO 9001" }, { id: 2, name: "ISO 14001" }];
    const pool = createPool([certs]);
    const repo = new CatalogRepo(pool);
    const rows = await repo.listActiveCertifications();
    expect(rows).toHaveLength(2);
    expect(String(pool.query.mock.calls[0][0])).toContain("is_active = 1");
  });

  it("searchUnspsc queries by code and title with LIMIT 30", async () => {
    const pool = createPool([[{ id: 1, title_zh: "水泵", title: "Pumps", code: "20105100", level: 4 }]]);
    const repo = new CatalogRepo(pool);
    const rows = await repo.searchUnspsc("pump");
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Pumps");
    const params = pool.query.mock.calls[0][1];
    expect(params[0]).toBe("pump%");
    expect(params[1]).toBe("%pump%");
    expect(params[2]).toBe("%pump%");
  });

  it("listUnspscWithTranslation delegates SQL to pool", async () => {
    const pool = createPool([[{ id: 1, title_zh: "测试", title: "Test", code: "12345600", level: 3 }]]);
    const repo = new CatalogRepo(pool);
    const rows = await repo.listUnspscWithTranslation("SELECT * FROM crm_unspsc_codes WHERE level = ?", [3]);
    expect(rows).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).toContain("SELECT * FROM crm_unspsc_codes");
  });

  it("upsertUnspscTranslations writes each entry with ON DUPLICATE KEY", async () => {
    const pool = createPool();
    const repo = new CatalogRepo(pool);
    await repo.upsertUnspscTranslations([
      { codeId: 1, lang: "zh", titleTr: "测试1", model: "deepseek" },
      { codeId: 2, lang: "en", titleTr: "Test2", model: "gemini" },
    ]);
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [sql, params] = pool.query.mock.calls[0];
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(params).toEqual([1, "zh", "测试1", "deepseek"]);
  });
});

// ─── UserPrefsRepo ─────────────────────────────────────────────────────────
describe("UserPrefsRepo", () => {
  it("getIndustryPrefs returns the first row or null", async () => {
    const prefs = { level1_id: 10, level2_id: 20, level3_id: null, level4_id: null, level5_id: null, updated_at: new Date() };
    const pool = createPool([[prefs], []]);
    const repo = new UserPrefsRepo(pool);
    expect(await repo.getIndustryPrefs("user@test.com")).toMatchObject({ level1_id: 10 });
    expect(await repo.getIndustryPrefs("ghost@test.com")).toBeNull();
    expect(pool.query.mock.calls[0][1]).toEqual(["user@test.com"]);
  });

  it("deleteIndustryPrefs executes DELETE by user_key", async () => {
    const pool = createPool();
    const repo = new UserPrefsRepo(pool);
    await repo.deleteIndustryPrefs("user@test.com");
    expect(pool.execute.mock.calls[0][1]).toEqual(["user@test.com"]);
    expect(String(pool.execute.mock.calls[0][0])).toContain("DELETE FROM crm_user_industry_prefs");
  });

  it("upsertIndustryPrefs writes all 5 levels with ON DUPLICATE KEY", async () => {
    const pool = createPool();
    const repo = new UserPrefsRepo(pool);
    await repo.upsertIndustryPrefs("user@test.com", [10, 20, 30, null, null]);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(params).toEqual(["user@test.com", 10, 20, 30, null, null]);
  });
});

// ─── TrainingRepo ──────────────────────────────────────────────────────────
describe("TrainingRepo", () => {
  it("can be instantiated with a pool", () => {
    const pool = createPool();
    const repo = new TrainingRepo(pool);
    expect(repo).toBeDefined();
  });
});
