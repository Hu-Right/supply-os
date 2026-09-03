/**
 * PaymentsRepo 方法级覆盖补全（架构评估 P0-T1 续）
 *
 * 覆盖非事务单 SQL 方法与事务变体（InTransaction 系列）：
 * 断言 SQL 关键字、参数绑定顺序与返回值形状——repo 层是
 * 参数化查询的唯一执行面，回归保护聚焦于 SQL/参数不被误改。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolConnection, RowDataPacket, FieldPacket } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { PaymentsRepo } from "./payments.repo";

type QueryResult = [RowDataPacket[], FieldPacket[]];

/** 构造 mysql2 query 返回形状：[结果行, 字段包] */
const rowsOf = (rows: unknown[]): QueryResult => [rows as RowDataPacket[], [] as FieldPacket[]];

function makePool() {
  return {
    query: vi.fn<() => Promise<QueryResult>>().mockResolvedValue(rowsOf([])),
    execute: vi.fn<() => Promise<[{ affectedRows: number }]>>().mockResolvedValue([{ affectedRows: 1 }]),
    getConnection: vi.fn().mockResolvedValue({ query: vi.fn(), execute: vi.fn(), release: vi.fn() }),
  } as unknown as Pool;
}

function makeConn() {
  return {
    query: vi.fn<() => Promise<QueryResult>>().mockResolvedValue(rowsOf([])),
    execute: vi.fn<() => Promise<[{ affectedRows: number }]>>().mockResolvedValue([{ affectedRows: 1 }]),
  } as unknown as PoolConnection;
}

/** 从 mock 调用中取出 (SQL 字符串, 参数列表)（mysql2 首参为 QueryOptions 联合类型，需窄化） */
function lastSql(mock: { mock: { calls: unknown[][] } }): [string, unknown[]] {
  const call = mock.mock.calls[mock.mock.calls.length - 1] as unknown as [string, unknown[]];
  return [call[0], call[1] ?? []];
}

let repo: PaymentsRepo;
let pool: Pool;

beforeEach(() => {
  vi.clearAllMocks();
  pool = makePool();
  repo = new PaymentsRepo(pool);
});

describe("PaymentsRepo 非事务方法", () => {
  it("getConnection → 透传 pool 连接", async () => {
    await repo.getConnection();
    expect(pool.getConnection).toHaveBeenCalled();
  });

  it("updatePendingOrder → 更新金额/支付链接/原始请求", async () => {
    await repo.updatePendingOrder("SO1", {
      amount: 700, currency: "CNY", payUrl: "/pay", qrCodeUrl: "qr", rawRequest: "{}",
    });
    const [sql, params] = lastSql(pool.execute as never);
    expect(sql).toContain("UPDATE crm_payment_orders");
    expect(params).toEqual([700, "CNY", "/pay", "qr", "{}", "SO1"]);
  });

  it("promoteToVip → UPDATE crm_users", async () => {
    await repo.promoteToVip(7);
    const [sql, params] = lastSql(pool.execute as never);
    expect(sql).toContain("UPDATE crm_users SET membership_tier = 'vip'");
    expect(params).toEqual([7]);
  });

  it("upsertNoticeInterest → 幂等 upsert 公告兴趣", async () => {
    await repo.upsertNoticeInterest(7, 42);
    const [sql, params] = lastSql(pool.execute as never);
    expect(sql).toContain("INSERT INTO crm_notice_interests");
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(params).toEqual([7, 42]);
  });

  it("markAsMockPaid → 覆写交易号与原始通知体", async () => {
    await repo.markAsMockPaid("SO1", "raw-body");
    const [sql, params] = lastSql(pool.execute as never);
    expect(sql).toContain("SET status = 'paid'");
    expect(params).toEqual(["MOCK-SO1", "raw-body", "SO1"]);
  });

  it("listActiveProviderConfigs → 返回渠道配置行", async () => {
    vi.mocked(pool.query).mockResolvedValue(rowsOf([{ provider: "alipay", mode: "live" }]));
    const rows = await repo.listActiveProviderConfigs();
    const [sql] = lastSql(pool.query as never);
    expect(sql).toContain("crm_payment_provider_configs");
    expect(rows).toHaveLength(1);
  });

  it("findActivePlan → 命中返回套餐，未命中返回 null", async () => {
    vi.mocked(pool.query).mockResolvedValue(rowsOf([{ plan_code: "annual_799", price: 799 }]));
    expect(await repo.findActivePlan("annual_799")).toMatchObject({ plan_code: "annual_799" });

    vi.mocked(pool.query).mockResolvedValue(rowsOf([]));
    expect(await repo.findActivePlan("ghost")).toBeNull();
  });

  it("findOrderAmount → 命中返回金额/状态，未命中返回 null", async () => {
    vi.mocked(pool.query).mockResolvedValue(rowsOf([{ amount: "799", status: "paid" }]));
    expect(await repo.findOrderAmount("SO1")).toEqual({ amount: 799, status: "paid" });

    vi.mocked(pool.query).mockResolvedValue(rowsOf([]));
    expect(await repo.findOrderAmount("SOX")).toBeNull();
  });
});

describe("PaymentsRepo 事务方法（InTransaction 系列）", () => {
  it("findOrderForUpdate → FOR UPDATE 悲观锁查询", async () => {
    const c = makeConn();
    vi.mocked(c.query).mockResolvedValue(rowsOf([{ user_id: 7 }]));
    const row = await repo.findOrderForUpdate(c, "SO1");
    const [sql] = lastSql(c.query as never);
    expect(sql).toContain("FOR UPDATE");
    expect(row).toMatchObject({ user_id: 7 });
  });

  it("findPlanInTransaction → 命中/未命中", async () => {
    const c = makeConn();
    vi.mocked(c.query).mockResolvedValue(rowsOf([{ plan_code: "vip_m" }]));
    expect(await repo.findPlanInTransaction(c, "vip_m")).toMatchObject({ plan_code: "vip_m" });
    vi.mocked(c.query).mockResolvedValue(rowsOf([]));
    expect(await repo.findPlanInTransaction(c, "ghost")).toBeNull();
  });

  it("createSubscriptionInTransaction → INSERT 订阅", async () => {
    const c = makeConn();
    await repo.createSubscriptionInTransaction(c, 7, "vip_m", 30);
    const [sql, params] = lastSql(c.execute as never);
    expect(sql).toContain("INSERT INTO crm_user_subscriptions");
    expect(params[0]).toBe(7);
  });

  it("insertEntitlementInTransaction → INSERT 权益", async () => {
    const c = makeConn();
    await repo.insertEntitlementInTransaction(c, {
      userId: 7, orderId: 1, entitlementType: "notice_unlock", refId: 42, quota: 1,
    } as never);
    const [sql] = lastSql(c.execute as never);
    expect(sql).toContain("INSERT INTO crm_user_entitlements");
  });

  it("promoteToVipInTransaction → UPDATE 用户为 VIP", async () => {
    const c = makeConn();
    await repo.promoteToVipInTransaction(c, 7);
    const [sql] = lastSql(c.execute as never);
    expect(sql).toContain("UPDATE crm_users");
  });

  it("markAsMockPaidInTransaction → 覆写 mock 支付状态", async () => {
    const c = makeConn();
    await repo.markAsMockPaidInTransaction(c, "SO1", "raw");
    const [sql] = lastSql(c.execute as never);
    expect(sql).toContain("UPDATE crm_payment_orders");
  });

  it("upsertNoticeInterestInTransaction → upsert 公告兴趣", async () => {
    const c = makeConn();
    await repo.upsertNoticeInterestInTransaction(c, 7, 42);
    const [sql] = lastSql(c.execute as never);
    expect(sql).toContain("INSERT INTO crm_notice_interests");
  });

  it("markEntitlementUpgradedInTransaction → 标记权益已升级", async () => {
    const c = makeConn();
    await repo.markEntitlementUpgradedInTransaction(c, 9);
    const [sql] = lastSql(c.execute as never);
    expect(sql).toContain("UPDATE crm_user_entitlements");
  });

  it("insertUpgradedEntitlementInTransaction → 写入升级后权益", async () => {
    const c = makeConn();
    await repo.insertUpgradedEntitlementInTransaction(c, {
      userId: 7, orderId: 2, entitlementType: "subscription", refId: 3,
    } as never);
    const [sql] = lastSql(c.execute as never);
    expect(sql).toContain("INSERT INTO crm_user_entitlements");
  });

  it("updateSubscriptionPlanInTransaction → 更新订阅套餐", async () => {
    const c = makeConn();
    await repo.updateSubscriptionPlanInTransaction(c, 11, "vip_y");
    const [sql, params] = lastSql(c.execute as never);
    expect(sql).toContain("UPDATE crm_user_subscriptions");
    expect(params).toEqual(["vip_y", 11]);
  });

  it("findBestEntitlementForUpgradeInTransaction / findUpgradeableSubscriptionInTransaction → 命中/未命中", async () => {
    const c = makeConn();
    vi.mocked(c.query).mockResolvedValue(rowsOf([{ id: 1 }]));
    expect(await repo.findBestEntitlementForUpgradeInTransaction(c, 7, "vip_y")).toMatchObject({ id: 1 });
    expect(await repo.findUpgradeableSubscriptionInTransaction(c, 7, "vip_y")).toMatchObject({ id: 1 });
    vi.mocked(c.query).mockResolvedValue(rowsOf([]));
    expect(await repo.findBestEntitlementForUpgradeInTransaction(c, 7, "vip_y")).toBeNull();
    expect(await repo.findUpgradeableSubscriptionInTransaction(c, 7, "vip_y")).toBeNull();
  });
});
