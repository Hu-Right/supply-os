/**
 * 支付订单 Repo 单元测试（架构评估 P0-T1：payments.repo 无测试）
 *
 * 重点覆盖与钱相关的 SQL 形状不变量：
 * - markAsPaidInTransaction 仅允许 pending 流转（审查 F19 状态机白名单）
 * - 首单特惠判定 LIKE 'single_%' 含 pending（产品决策 2026-08-30）
 * - 可抵扣单查询：7 天窗口 + 未被引用（一单只抵一次）
 * - 全部外部输入经 ? 参数绑定
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolConnection } from "mysql2/promise";

vi.mock("server-only", () => ({}));

type QueryFn = ReturnType<typeof vi.fn>;

function makePool(queryResult: unknown[][]) {
  const query: QueryFn = vi.fn(async () => [queryResult.shift() ?? []]);
  const execute: QueryFn = vi.fn(async () => [{}]);
  const pool = { query, execute } as unknown as Pool;
  return { pool, query, execute };
}

function makeConn() {
  return {
    query: vi.fn(async () => [[]]) as QueryFn,
    execute: vi.fn(async () => [{}]) as QueryFn,
  } as unknown as PoolConnection & { query: QueryFn; execute: QueryFn };
}

import { PaymentsRepo } from "./payments.repo";

describe("PaymentsRepo 查询方法", () => {
  beforeEach(() => vi.clearAllMocks());

  it("findByOrderNo：返回首行，无行返回 null", async () => {
    const row = { order_no: "SO1", amount: "99" };
    const { pool, query } = makePool([[row]]);
    const repo = new PaymentsRepo(pool);
    expect(await repo.findByOrderNo("SO1")).toBe(row);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE order_no = ? LIMIT 1"), ["SO1"]);
  });

  it("findByOrderNo：空结果 → null", async () => {
    const { pool } = makePool([[]]);
    expect(await new PaymentsRepo(pool).findByOrderNo("NOPE")).toBeNull();
  });

  it("findPendingOrder：四元组参数按序绑定（含 notice_id <=> NULL 语义）", async () => {
    const { pool, query } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.findPendingOrder({ userKey: "u1", planCode: "single_99", provider: "mock", noticeId: null });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("(notice_id <=> ?)"), ["u1", "single_99", "mock", null]);
  });
});

describe("PaymentsRepo 订单写入", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createOrder：13 个参数按序绑定，order_type 默认 new", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.createOrder({
      userKey: "u1", orderNo: "SO1", provider: "mock", planCode: "single_99",
      noticeId: null, amount: 99, currency: "CNY", payUrl: "/pay", qrCodeUrl: null, rawRequest: "{}",
    });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("'pending'");
    expect(params).toEqual([
      "u1", "SO1", "u1", "mock", "single_99", "new", null,
      null, 99, "CNY", "/pay", null, "{}",
    ]);
  });

  it("createOrder：升级订单写入 original_order_no 与 upgrade 类型", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.createOrder({
      userKey: "u1", orderNo: "SO2", provider: "alipay", planCode: "annual_799",
      noticeId: 5, amount: 700, currency: "CNY", payUrl: null, qrCodeUrl: null, rawRequest: "{}",
      orderType: "upgrade", originalOrderNo: "SO1",
    });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("order_type");
    expect(params[5]).toBe("upgrade");
    expect(params[6]).toBe("SO1");
    expect(params[7]).toBe(5);
  });

  it("markAsPaid：providerTradeNo 为 null 时 COALESCE 保留原交易号", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.markAsPaid("SO1", null);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("COALESCE(?, provider_trade_no)");
    expect(params).toEqual([null, "SO1"]);
  });
});

describe("PaymentsRepo 权益与订阅（履约侧）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("insertEntitlement：durationDays=null 时 expires_at 写 NULL 且参数 5 个", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.insertEntitlement({ userKey: "u1", orderNo: "SO1", planCode: "annual_799", quotaTotal: 100, durationDays: null });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).not.toContain("DATE_ADD");
    expect(sql).toContain("'active'");
    expect(params).toEqual(["u1", "u1", "SO1", "annual_799", 100]);
  });

  it("insertEntitlement：durationDays=365 时 DATE_ADD 绑定天数参数", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.insertEntitlement({ userKey: "u1", orderNo: "SO1", planCode: "annual_799", quotaTotal: 100, durationDays: 365 });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("DATE_ADD(NOW(), INTERVAL ? DAY)");
    expect(params).toEqual(["u1", "u1", "SO1", "annual_799", 100, 365]);
  });

  it("createSubscription：days=null 永不过期分支", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.createSubscription("u1", "annual_8800", null);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("expires_at");
    expect(params).toEqual(["u1", "u1", "annual_8800"]);
  });
});

describe("PaymentsRepo 事务方法（状态机不变量）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("F19：markAsPaidInTransaction 仅流转 pending（防 closed/refunded 被复活）", async () => {
    const conn = makeConn();
    const { pool } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.markAsPaidInTransaction(conn, "SO1", "TRADE-1");
    const [sql] = conn.execute.mock.calls[0];
    expect(sql).toContain("AND status = 'pending'");
  });

  it("hasEntitlementForOrder：行数>0 → true", async () => {
    const conn = makeConn();
    conn.query.mockResolvedValueOnce([[{ id: 1 }]]);
    const { pool } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    expect(await repo.hasEntitlementForOrder(conn, "SO1")).toBe(true);
  });

  it("markEntitlementUpgradedInTransaction：写 is_upgraded=1 且保留 quota_used", async () => {
    const conn = makeConn();
    const { pool } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.markEntitlementUpgradedInTransaction(conn, 7);
    const [sql, params] = conn.execute.mock.calls[0];
    expect(sql).toContain("is_upgraded = 1");
    expect(sql).not.toContain("quota_used");
    expect(params).toEqual([7]);
  });
});

describe("PaymentsRepo 首单特惠资格（产品决策 2026-08-30）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hasSingleUnlockRecord：LIKE 'single_%' 且 pending/paid 均计入", async () => {
    const { pool, query } = makePool([[{ "1": 1 }]]);
    const repo = new PaymentsRepo(pool);
    expect(await repo.hasSingleUnlockRecord("u1")).toBe(true);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("plan_code LIKE 'single_%'");
    expect(sql).toContain("status IN ('pending','paid')");
    expect(params).toEqual(["u1"]);
  });

  it("hasSingleUnlockRecord：无记录 → false", async () => {
    const { pool } = makePool([[]]);
    expect(await new PaymentsRepo(pool).hasSingleUnlockRecord("u1")).toBe(false);
  });

  it("findDeductibleSingleOrder：仅 single_99 + 7 天窗口 + 未被引用", async () => {
    const row = { order_no: "SO-SRC", amount: "99", paid_at: new Date() };
    const { pool, query } = makePool([[row]]);
    const repo = new PaymentsRepo(pool);
    const result = await repo.findDeductibleSingleOrder("u1");
    expect(result).toEqual({ order_no: "SO-SRC", amount: 99, paid_at: row.paid_at });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("plan_code = 'single_99'");
    expect(sql).toContain("INTERVAL 7 DAY");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("o2.status <> 'closed'");
    expect(params).toEqual(["u1"]);
  });

  it("findDeductibleSingleOrder：无可抵扣 → null", async () => {
    const { pool } = makePool([[]]);
    expect(await new PaymentsRepo(pool).findDeductibleSingleOrder("u1")).toBeNull();
  });
});
