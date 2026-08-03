// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { UsersRepo } from "../../../server/repos/users.repo";
import { MembershipRepo } from "../../../server/repos/membership.repo";
import { PaymentsRepo } from "../../../server/repos/payments.repo";
import { OpportunitiesRepo } from "../../../server/repos/opportunities.repo";

/**
 * mock mysql2 pool：query/execute 均返回 [rows]（mysql2 解构约定）。
 * queryResults 按调用顺序依次返回。
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

// ─── UsersRepo ──────────────────────────────────────────────────────────────
describe("UsersRepo", () => {
  it("findByKey returns the first row or null", async () => {
    const pool = createPool([[{ user_key: "a@b.com", email: "a@b.com" }], []]);
    const repo = new UsersRepo(pool);
    expect(await repo.findByKey("a@b.com")).toMatchObject({ user_key: "a@b.com" });
    expect(await repo.findByKey("ghost")).toBeNull();
    expect(pool.query.mock.calls[0][1]).toEqual(["a@b.com"]);
  });

  it("findProfileByKey selects only profile columns", async () => {
    const pool = createPool([[{ user_key: "a@b.com", display_name: "A" }]]);
    const repo = new UsersRepo(pool);
    await repo.findProfileByKey("a@b.com");
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain("display_name");
    expect(sql).not.toContain("password_hash,");
    expect(sql).toContain("LIMIT 1");
  });

  it("upsert inserts with free tier / pending status defaults", async () => {
    const pool = createPool();
    const repo = new UsersRepo(pool);
    await repo.upsert({
      user_key: "a@b.com",
      email: "a@b.com",
      display_name: "A",
      password_hash: "hash",
    });
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql).toContain("'free', 'pending'");
    expect(params).toEqual(["a@b.com", "a@b.com", "A", "hash"]);
  });

  it("updateMembershipTier updates by user_key", async () => {
    const pool = createPool();
    const repo = new UsersRepo(pool);
    await repo.updateMembershipTier("a@b.com", "vip");
    expect(pool.execute.mock.calls[0][1]).toEqual(["vip", "a@b.com"]);
  });
});

// ─── MembershipRepo ─────────────────────────────────────────────────────────
describe("MembershipRepo", () => {
  it("findActivePlans returns rows ordered by sort_order", async () => {
    const plans = [
      { plan_code: "free", price: 0 },
      { plan_code: "annual", price: 5600 },
    ];
    const pool = createPool([plans]);
    const repo = new MembershipRepo(pool);
    await expect(repo.findActivePlans()).resolves.toEqual(plans);
    expect(pool.query.mock.calls[0][0]).toContain("is_active = 1");
  });

  it("findPlanByCode only matches active plans", async () => {
    const pool = createPool([[{ plan_code: "annual" }], []]);
    const repo = new MembershipRepo(pool);
    expect(await repo.findPlanByCode("annual")).toMatchObject({ plan_code: "annual" });
    expect(await repo.findPlanByCode("ghost")).toBeNull();
    expect(pool.query.mock.calls[0][0]).toContain("is_active = 1");
  });

  it("findPlanByCodeForFulfillment includes inactive plans", async () => {
    const pool = createPool([[{ plan_code: "legacy" }]]);
    const repo = new MembershipRepo(pool);
    expect(await repo.findPlanByCodeForFulfillment("legacy")).toMatchObject({ plan_code: "legacy" });
    expect(pool.query.mock.calls[0][0]).not.toContain("is_active");
  });

  it("getFreeQuota falls back to 3 when missing", async () => {
    const pool = createPool([
      [{ free_quota: 5 }], // 正常取值
      [], // 无 free 套餐 → 默认 3
      [{ free_quota: 0 }], // 0 也走默认（|| 3 语义）
    ]);
    const repo = new MembershipRepo(pool);
    expect(await repo.getFreeQuota()).toBe(5);
    expect(await repo.getFreeQuota()).toBe(3);
    expect(await repo.getFreeQuota()).toBe(3);
  });

  it("findActiveSubscriptions filters active & not expired in SQL", async () => {
    const pool = createPool([[{ plan_code: "annual", status: "active" }]]);
    const repo = new MembershipRepo(pool);
    const rows = await repo.findActiveSubscriptions("a@b.com");
    expect(rows).toHaveLength(1);
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("expires_at > NOW()");
    expect(pool.query.mock.calls[0][1]).toEqual(["a@b.com"]);
  });

  it("countFreeUnlocks / countPaidUnlocks count by unlock_type", async () => {
    const pool = createPool([[{ total: 2 }], [{ total: 7 }]]);
    const repo = new MembershipRepo(pool);
    expect(await repo.countFreeUnlocks("a@b.com")).toBe(2);
    expect(await repo.countPaidUnlocks("a@b.com")).toBe(7);
    expect(pool.query.mock.calls[0][0]).toContain("unlock_type = 'free'");
    expect(pool.query.mock.calls[1][0]).toContain("unlock_type IN ('single','subscription')");
  });

  it("findActiveEntitlements requires remaining quota", async () => {
    const pool = createPool([[{ id: 1, quota_remaining: 3 }]]);
    const repo = new MembershipRepo(pool);
    const rows = await repo.findActiveEntitlements("a@b.com");
    expect(rows).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).toContain("quota_total > quota_used");
  });
});

// ─── PaymentsRepo ───────────────────────────────────────────────────────────
describe("PaymentsRepo", () => {
  const baseOrder = {
    order_no: "PAY-1",
    user_key: "a@b.com",
    provider: "mock",
    plan_code: "annual",
    amount: 5600,
    currency: "CNY",
    status: "pending",
  };

  it("findByOrderNo returns the order or null", async () => {
    const pool = createPool([[baseOrder], []]);
    const repo = new PaymentsRepo(pool);
    expect(await repo.findByOrderNo("PAY-1")).toMatchObject({ order_no: "PAY-1" });
    expect(await repo.findByOrderNo("NOPE")).toBeNull();
  });

  it("findPendingOrder matches null-safe notice_id", async () => {
    const pool = createPool([[baseOrder]]);
    const repo = new PaymentsRepo(pool);
    await repo.findPendingOrder({
      userKey: "a@b.com",
      planCode: "annual",
      provider: "mock",
      noticeId: null,
    });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("notice_id <=> ?");
    expect(params).toEqual(["a@b.com", "annual", "mock", null]);
  });

  it("createOrder inserts a pending order with 11 params", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.createOrder({
      userKey: "a@b.com",
      orderNo: "PAY-1",
      provider: "mock",
      planCode: "annual",
      noticeId: null,
      amount: 5600,
      currency: "CNY",
      payUrl: "https://pay",
      qrCodeUrl: null,
      rawRequest: "{}",
    });
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("'pending'");
    expect(params).toEqual([
      "a@b.com", "PAY-1", "a@b.com", "mock", "annual",
      null, 5600, "CNY", "https://pay", null, "{}",
    ]);
  });

  it("updatePendingOrder updates by order_no within pending status", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.updatePendingOrder("PAY-1", {
      amount: 89,
      currency: "CNY",
      payUrl: null,
      qrCodeUrl: null,
      rawRequest: "{}",
    });
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
    expect(params).toEqual([89, "CNY", null, null, "{}", "PAY-1"]);
  });

  it("markAsPaid keeps original paid_at when already set", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.markAsPaid("PAY-1", "TRADE-1");
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("COALESCE(paid_at, NOW())");
    expect(params).toEqual(["TRADE-1", "PAY-1"]);
  });

  it("countOrders appends status filter only when provided", async () => {
    const pool = createPool([[{ total: 4 }], [{ total: 2 }]]);
    const repo = new PaymentsRepo(pool);
    expect(await repo.countOrders("a@b.com", "")).toBe(4);
    expect(await repo.countOrders("a@b.com", "paid")).toBe(2);
    expect(pool.query.mock.calls[0][0]).not.toContain("o.status = ?");
    expect(pool.query.mock.calls[1][0]).toContain("o.status = ?");
    expect(pool.query.mock.calls[1][1]).toEqual(["a@b.com", "paid"]);
  });

  it("listOrders paginates with limit/offset and optional status", async () => {
    const pool = createPool([[{ order_no: "PAY-1" }]]);
    const repo = new PaymentsRepo(pool);
    const rows = await repo.listOrders("a@b.com", "", 10, 20);
    expect(rows).toHaveLength(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("LEFT JOIN crm_bid_notices");
    expect(params).toEqual(["a@b.com", 10, 20]);
  });

  it("countUnlocks only counts notice unlocks", async () => {
    const pool = createPool([[{ total: 3 }]]);
    const repo = new PaymentsRepo(pool);
    expect(await repo.countUnlocks("a@b.com")).toBe(3);
    expect(pool.query.mock.calls[0][0]).toContain("u.notice_id IS NOT NULL");
  });

  it("listUnlocks switches SQL and params by withTranslation", async () => {
    const pool = createPool([[{ notice_id: 1 }], [{ notice_id: 2, title_i18n: "Bonjour" }]]);
    const repo = new PaymentsRepo(pool);

    await repo.listUnlocks("a@b.com", 10, 0, null);
    const [plainSql, plainParams] = pool.query.mock.calls[0];
    expect(plainSql).not.toContain("crm_notice_translations");
    expect(plainParams).toEqual(["a@b.com", 10, 0]);

    const rows = await repo.listUnlocks("a@b.com", 10, 0, { lang: "fr" });
    const [trSql, trParams] = pool.query.mock.calls[1];
    expect(trSql).toContain("title_i18n");
    expect(trParams).toEqual(["fr", "a@b.com", 10, 0]);
    expect(rows[0]).toMatchObject({ title_i18n: "Bonjour" });
  });

  it("upsertNoticeTranslation writes translation cache via query", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.upsertNoticeTranslation(42, "fr", "Titre", "Desc", "gpt");
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(params).toEqual([42, "fr", "Titre", "Desc", "gpt"]);
  });

  it("createSubscription branches on days (null → never expires)", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);

    await repo.createSubscription("a@b.com", "annual", 1095);
    const [datedSql, datedParams] = pool.execute.mock.calls[0];
    expect(datedSql).toContain("DATE_ADD(NOW(), INTERVAL ? DAY)");
    expect(datedParams).toEqual(["a@b.com", "a@b.com", "annual", 1095]);

    await repo.createSubscription("a@b.com", "lifetime", null);
    const [nullSql, nullParams] = pool.execute.mock.calls[1];
    expect(nullSql).toContain("NULL");
    expect(nullSql).not.toContain("DATE_ADD");
    expect(nullParams).toEqual(["a@b.com", "a@b.com", "lifetime"]);
  });

  it("promoteToVip sets membership_tier=vip", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.promoteToVip("a@b.com");
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("membership_tier = 'vip'");
    expect(params).toEqual(["a@b.com"]);
  });

  it("insertEntitlement branches on durationDays", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);

    await repo.insertEntitlement({
      userKey: "a@b.com",
      orderNo: "PAY-1",
      planCode: "annual",
      quotaTotal: 365,
      durationDays: 1095,
    });
    expect(pool.execute.mock.calls[0][1]).toEqual([
      "a@b.com", "a@b.com", "PAY-1", "annual", 365, 1095,
    ]);

    await repo.insertEntitlement({
      userKey: "a@b.com",
      orderNo: "PAY-2",
      planCode: "lifetime",
      quotaTotal: 10,
      durationDays: null,
    });
    const [nullSql, nullParams] = pool.execute.mock.calls[1];
    expect(nullSql).not.toContain("DATE_ADD");
    expect(nullParams).toEqual(["a@b.com", "a@b.com", "PAY-2", "lifetime", 10]);
  });

  it("upsertNoticeInterest records payment-sourced subscription", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.upsertNoticeInterest("a@b.com", 42);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("'subscribed', 'payment'");
    expect(params).toEqual(["a@b.com", "a@b.com", 42]);
  });

  it("markAsMockPaid prefixes trade_no with MOCK-", async () => {
    const pool = createPool();
    const repo = new PaymentsRepo(pool);
    await repo.markAsMockPaid("PAY-1", '{"ok":true}');
    expect(pool.execute.mock.calls[0][1]).toEqual(["MOCK-PAY-1", '{"ok":true}', "PAY-1"]);
  });

  it("listActiveProviderConfigs returns active configs", async () => {
    const configs = [{ provider: "alipay", mode: "configured", is_active: 1 }];
    const pool = createPool([configs]);
    const repo = new PaymentsRepo(pool);
    await expect(repo.listActiveProviderConfigs()).resolves.toEqual(configs);
    expect(pool.query.mock.calls[0][0]).toContain("is_active = 1");
  });
});

// ─── OpportunitiesRepo ──────────────────────────────────────────────────────
describe("OpportunitiesRepo", () => {
  it("listOpportunities without codeId skips the unspsc join", async () => {
    const pool = createPool([[{ id: 1, title: "t" }]]);
    const repo = new OpportunitiesRepo(pool);
    const rows = await repo.listOpportunities(0);
    expect(rows).toHaveLength(1);
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain("FROM crm_bid_opportunities o");
    expect(sql).not.toContain("INNER JOIN");
  });

  it("listOpportunities with codeId filters by level column", async () => {
    const pool = createPool([[{ id: 5, level: 2 }], [{ id: 9 }]]);
    const repo = new OpportunitiesRepo(pool);
    await repo.listOpportunities(5);
    const sql: string = pool.query.mock.calls[1][0];
    expect(sql).toContain("boc.level2_id = ?");
    expect(pool.query.mock.calls[1][1]).toEqual([5]);
  });

  it("findExistingUnlock returns null when no rows", async () => {
    const pool = createPool([[]]);
    const repo = new OpportunitiesRepo(pool);
    expect(await repo.findExistingUnlock("u", 1)).toBeNull();
  });

  it("upsertInterestCode writes unlock_order source with weight 2.50", async () => {
    const pool = createPool();
    const repo = new OpportunitiesRepo(pool);
    await repo.upsertInterestCode({ userKey: "u", codeId: 3, code: "1010", level: 2 });
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("'unlock_order', 2.50");
    expect(params).toEqual(["u", "u", 3, "1010", 2]);
  });
});
