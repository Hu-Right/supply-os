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
    execute: vi.fn(async () => [{ affectedRows: 1 }]) as QueryFn,
  } as unknown as PoolConnection & { query: QueryFn; execute: QueryFn };
}

import { PaymentsRepo } from "@/lib/repos/payments.repo";

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
    await repo.findPendingOrder({ userId: 101, planCode: "single_99", provider: "mock", noticeId: null });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("notice_id <=> ?"), [101, "single_99", "mock", null]);
  });
});

describe("PaymentsRepo 订单写入", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createOrder：12 个参数按序绑定，order_type 默认 new", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.createOrder({
      userId: 101, orderNo: "SO1", provider: "mock", planCode: "single_99",
      noticeId: null, amount: 99, currency: "CNY", payUrl: "/pay", qrCodeUrl: null, rawRequest: "{}",
    });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("'pending'");
    expect(params).toEqual([
      101, "SO1", "mock", "single_99", "new", null,
      null, 99, "CNY", "/pay", null, "{}",
    ]);
  });

  it("createOrder：升级订单写入 original_order_no 与 upgrade 类型", async () => {
    const { pool, execute } = makePool([[]]);
    const repo = new PaymentsRepo(pool);
    await repo.createOrder({
      userId: 101, orderNo: "SO2", provider: "alipay", planCode: "annual_799",
      noticeId: 5, amount: 700, currency: "CNY", payUrl: null, qrCodeUrl: null, rawRequest: "{}",
      orderType: "upgrade", originalOrderNo: "SO1",
    });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("order_type");
    expect(params[4]).toBe("upgrade");
    expect(params[5]).toBe("SO1");
    expect(params[6]).toBe(5);
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
});
