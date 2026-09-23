import { describe, it, expect, vi } from "vitest";
import { activatePaidOrder } from "@/lib/payment/activate";
import { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import { BenefitWriteRepo } from "@/lib/repos/benefit-write.repo";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";
import type { PoolConnection } from "mysql2/promise";

vi.mock("server-only", () => ({}));

function environment(options: { status?: string; plan?: boolean; missingCell?: boolean; failPaid?: boolean; provider?: string } = {}) {
  const sqls: string[] = [];
  const order = { user_id: 7, order_no: "SO1", plan_code: "pro", amount: "999.00", currency: "CNY", status: options.status ?? "pending", provider: options.provider ?? "alipay", order_type: "new" };
  const conn = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.includes("crm_plan_catalog")) return [options.plan === false ? [] : [{ plan_code: "pro", price_mode: "fixed", is_active: 1, seat_limit: 1, currency: "CNY", billing_period_days: 365 }]];
      if (sql.includes("crm_benefit_catalog")) return [[{ benefit_code: "notice_view", is_consumable: 1, value_kind: "quota" }]];
      if (sql.includes("crm_plan_benefits")) return [options.missingCell ? [] : [{ benefit_code: "notice_view", value_num: 100 }]];
      if (sql.includes("DATE_ADD")) return [[{ expires_at: new Date("2030-01-01") }]];
      return [[]];
    }),
    execute: vi.fn(async (sql: string) => { sqls.push(sql); return [{ insertId: 51, affectedRows: 1 }]; }),
  };
  const payments = {
    getConnection: vi.fn(async () => conn),
    findOrderForUpdate: vi.fn(async () => order),
    markAsPaidInTransaction: vi.fn(async () => {
      if (options.failPaid) throw new Error("WRITE_FAILED");
      order.status = "paid";
    }),
    markAsMockPaidInTransaction: vi.fn(async () => { order.status = "paid"; }),
    upsertNoticeInterestInTransaction: vi.fn(),
  };
  const benefit = { catalog: new BenefitSystemRepo(conn as never), write: new BenefitWriteRepo() };
  return { order, conn, payments, benefit, sqls, repo: payments as unknown as PaymentsRepo };
}

describe("新权益履约事务", () => {
  it("一次支付写入新订阅、席位、账本后提交", async () => {
    const e = environment();
    await activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit);
    for (const table of ["crm_plan_subscriptions", "crm_subscription_seats", "crm_benefit_quotas"]) {
      expect(e.sqls.some(sql => sql.includes(`INSERT INTO ${table}`))).toBe(true);
    }
    expect(e.sqls.join(" ")).not.toMatch(/crm_user_subscriptions|crm_user_entitlements|crm_membership_plans/);
    expect(e.conn.commit).toHaveBeenCalledOnce();
    expect(e.payments.markAsPaidInTransaction).toHaveBeenCalledOnce();
  });
  it("缺格使整个支付回滚，不能少发池却标 paid", async () => {
    const e = environment({ missingCell: true });
    await expect(activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit)).rejects.toMatchObject({ code: "MATRIX_INVALID" });
    expect(e.conn.rollback).toHaveBeenCalledOnce();
    expect(e.conn.commit).not.toHaveBeenCalled();
    expect(e.payments.markAsPaidInTransaction).not.toHaveBeenCalled();
  });
  it("旧码不存在时拒绝，不回退旧目录", async () => {
    const e = environment({ plan: false });
    await expect(activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit)).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    expect(e.conn.rollback).toHaveBeenCalledOnce();
  });
  it("重放已支付订单不再发放", async () => {
    const e = environment();
    await activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit);
    const writes = e.conn.execute.mock.calls.length;
    await activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit);
    expect(e.conn.execute.mock.calls).toHaveLength(writes);
    expect(e.payments.markAsPaidInTransaction).toHaveBeenCalledOnce();
  });
  it.each(["closed", "refunded", "expired"])("终态 %s 不被回调复活", async status => {
    const e = environment({ status });
    await activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit);
    expect(e.conn.execute).not.toHaveBeenCalled();
    expect(e.payments.markAsPaidInTransaction).not.toHaveBeenCalled();
  });
  it("订单标记失败回滚所有发放，并释放连接", async () => {
    const e = environment({ failPaid: true });
    await expect(activatePaidOrder(e.repo, "SO1", "ALI1", e.benefit)).rejects.toThrow("WRITE_FAILED");
    expect(e.conn.rollback).toHaveBeenCalledOnce();
    expect(e.conn.commit).not.toHaveBeenCalled();
    expect(e.conn.release).toHaveBeenCalledOnce();
  });
  it("Mock 使用同一个订单锁和发放事务，不能伪激活真实渠道订单", async () => {
    const e = environment();
    await expect(activatePaidOrder(e.repo, "SO1", undefined, e.benefit, "{}" )).rejects.toThrow("MOCK_PROVIDER_REQUIRED");
    expect(e.conn.execute).not.toHaveBeenCalled();
  });
  it("Mock 重放也只发一次", async () => {
    const e = environment({ provider: "mock" });
    await activatePaidOrder(e.repo, "SO1", undefined, e.benefit, "{}");
    await activatePaidOrder(e.repo, "SO1", undefined, e.benefit, "{}");
    expect(e.payments.markAsMockPaidInTransaction).toHaveBeenCalledOnce();
    expect(e.payments.findOrderForUpdate).toHaveBeenCalledTimes(2);
  });
});
