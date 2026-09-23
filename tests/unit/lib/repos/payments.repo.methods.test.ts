/**
 * PaymentsRepo 方法级覆盖补全（架构评估 P0-T1 续 · 单轨改造后）
 *
 * 覆盖支付订单 Repo 现存的 SQL 形状不变量：连接透传、pending 订单更新、
 * 渠道配置读取、FOR UPDATE 悲观锁、mock 支付与公告兴趣事务写入、订单金额查询。
 * 旧权益/订阅写入方法（createSubscription/insertEntitlement/promoteToVip/
 * findActivePlan/findPlanInTransaction/…）已随单轨迁移移除，其新表组行为由
 * benefit-write.repo.test.ts、benefit-native/fulfillment/upgrade 测试覆盖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolConnection, RowDataPacket, FieldPacket } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { PaymentsRepo } from "@/lib/repos/payments.repo";

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

  it("listActiveProviderConfigs → 返回渠道配置行", async () => {
    vi.mocked(pool.query).mockResolvedValue(rowsOf([{ provider: "alipay", mode: "live" }]));
    const rows = await repo.listActiveProviderConfigs();
    const [sql] = lastSql(pool.query as never);
    expect(sql).toContain("crm_payment_provider_configs");
    expect(rows).toHaveLength(1);
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
});
