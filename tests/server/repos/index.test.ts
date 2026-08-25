/**
 * server/repos/ 数据层测试
 * 覆盖 UserPrefsRepo, CatalogRepo（部分）, PaymentsRepo（部分）
 * 使用 mock pool 验证 SQL 调用与返回值映射
 */
import { describe, it, expect, vi } from "vitest";

// ── UserPrefsRepo ──
import { UserPrefsRepo } from "../../../server/repos/user-prefs.repo";

describe("UserPrefsRepo", () => {
  function makePool(queryResult?: any[]) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([{}]),
    } as any;
  }

  it("getIndustryPrefs 返回首行或 null", async () => {
    const row = { level1_id: 1, level2_id: 2, level3_id: null, level4_id: null, level5_id: null, updated_at: new Date() };
    const pool = makePool([row]);
    const repo = new UserPrefsRepo(pool);
    const result = await repo.getIndustryPrefs("user-1");
    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("crm_user_industry_prefs"), ["user-1"]);
  });

  it("getIndustryPrefs 无记录返回 null", async () => {
    const pool = makePool([]);
    const repo = new UserPrefsRepo(pool);
    const result = await repo.getIndustryPrefs("user-none");
    expect(result).toBeNull();
  });

  it("deleteIndustryPrefs 调用 execute", async () => {
    const pool = makePool();
    const repo = new UserPrefsRepo(pool);
    await repo.deleteIndustryPrefs("user-1");
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), ["user-1"]);
  });

  it("upsertIndustryPrefs 传入正确参数", async () => {
    const pool = makePool();
    const repo = new UserPrefsRepo(pool);
    await repo.upsertIndustryPrefs("user-1", [10, 20, null, null, null]);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("ON DUPLICATE KEY UPDATE"),
      ["user-1", 10, 20, null, null, null],
    );
  });
});

// ── CatalogRepo ──
import { CatalogRepo } from "../../../server/repos/catalog.repo";

describe("CatalogRepo", () => {
  function makePool(queryResult?: any[]) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([{}]),
    } as any;
  }

  it("listActiveCertifications 返回行数组", async () => {
    const certs = [{ id: 1, name: "ISO 9001" }, { id: 2, name: "CE" }];
    const pool = makePool(certs);
    const repo = new CatalogRepo(pool);
    const result = await repo.listActiveCertifications();
    expect(result).toEqual(certs);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("crm_supplier_certifications"));
  });

  it("findUnspscNodeById 返回节点或 null", async () => {
    const node = { id: 42, code: "4214", title_zh: "医疗器械", title: "Medical", parent_id: 10, level: 2 };
    const pool = makePool([node]);
    const repo = new CatalogRepo(pool);
    const result = await repo.findUnspscNodeById(42);
    expect(result).toEqual(node);
  });

  it("findUnspscNodeById 不存在返回 null", async () => {
    const pool = makePool([]);
    const repo = new CatalogRepo(pool);
    const result = await repo.findUnspscNodeById(999);
    expect(result).toBeNull();
  });

  it("searchUnspsc 使用 LIKE 查询", async () => {
    const pool = makePool([{ id: 1, title_zh: "医疗", title: "Medical", code: "4214", parent_id: null, level: 2 }]);
    const repo = new CatalogRepo(pool);
    const result = await repo.searchUnspsc("医疗");
    expect(result.length).toBe(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("LIKE"),
      expect.arrayContaining([expect.stringContaining("医疗")]),
    );
  });

  it("upsertUnspscTranslations 空数组不调用 query", async () => {
    const pool = makePool();
    const repo = new CatalogRepo(pool);
    await repo.upsertUnspscTranslations([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("upsertUnspscTranslations 批量写入", async () => {
    const pool = makePool();
    const repo = new CatalogRepo(pool);
    await repo.upsertUnspscTranslations([
      { codeId: 1, lang: "zh", titleTr: "翻译1", model: "gpt" },
      { codeId: 2, lang: "zh", titleTr: "翻译2", model: "gpt" },
    ]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO crm_unspsc_translations"),
      expect.arrayContaining([1, "zh", "翻译1", "gpt"]),
    );
  });
});

// ── PaymentsRepo ──
import { PaymentsRepo } from "../../../server/repos/payments.repo";

describe("PaymentsRepo", () => {
  function makePool(queryResult?: any[]) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([{}]),
      getConnection: vi.fn().mockResolvedValue({
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        query: vi.fn().mockResolvedValue([[]]),
        release: vi.fn(),
      }),
    } as any;
  }

  it("findByOrderNo 返回订单或 null", async () => {
    const order = { order_no: "ORD-001", user_key: "u1", status: "paid" };
    const pool = makePool([order]);
    const repo = new PaymentsRepo(pool);
    const result = await repo.findByOrderNo("ORD-001");
    expect(result).toEqual(order);
  });

  it("findByOrderNo 不存在返回 null", async () => {
    const pool = makePool([]);
    const repo = new PaymentsRepo(pool);
    const result = await repo.findByOrderNo("NONE");
    expect(result).toBeNull();
  });

  it("getConnection 返回连接", async () => {
    const pool = makePool();
    const repo = new PaymentsRepo(pool);
    const conn = await repo.getConnection();
    expect(pool.getConnection).toHaveBeenCalled();
    expect(conn).toBeDefined();
  });
});

// ── membership.repo ──
import { MembershipRepo } from "../../../server/repos/membership.repo";

describe("MembershipRepo", () => {
  function makePool(queryResult?: any[]) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([{}]),
    } as any;
  }

  it("findPlanByCode 返回套餐或 null", async () => {
    const plan = { plan_code: "premium", name: "Premium", price: 500, unlock_quota: 100, is_active: 1 };
    const pool = makePool([plan]);
    const repo = new MembershipRepo(pool);
    const result = await repo.findPlanByCode("premium");
    expect(result).toEqual(plan);
  });

  it("findPlanByCode 不存在返回 null", async () => {
    const pool = makePool([]);
    const repo = new MembershipRepo(pool);
    const result = await repo.findPlanByCode("nonexistent");
    expect(result).toBeNull();
  });
});
