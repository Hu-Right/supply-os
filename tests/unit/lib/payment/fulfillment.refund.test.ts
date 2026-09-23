import { describe, it, expect, vi } from "vitest";
import { reverseFulfilledOrder } from "@/lib/payment/reverse";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";
import type { BenefitFulfillDeps } from "@/lib/payment/benefit-grant";

function env(status = "paid", subscriptionId: number | null = 11, linked = false) {
  const statements: string[] = [];
  const conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    query: vi.fn(async () => [linked ? [{ order_no: "SO2" }] : []]),
    execute: vi.fn(async (sql: string) => { statements.push(sql); return [{ affectedRows: 1 }]; }),
  };
  const order = { order_no: "SO1", user_id: 7, status, plan_code: "pro" };
  const repo = { getConnection: vi.fn(async () => conn), findOrderForUpdate: vi.fn(async () => order) };
  const write = {
    findSubscriptionIdBySourceOrder: vi.fn(async () => subscriptionId),
    findSubscriptionForUpdate: vi.fn(async () => ({ id: 11, owner_user_id: 7, replaced_by_id: null })),
    refundSubscription: vi.fn(async () => ({ frozenPools: 1 })),
    freezePoolsOfSubscription: vi.fn(),
  };
  const deps = { write, catalog: {} } as unknown as BenefitFulfillDeps;
  const run = () => reverseFulfilledOrder(repo as unknown as PaymentsRepo, "SO1", deps);
  return { run, conn, repo, statements, write };
}

describe("新账本退款", () => {
  it("按订单来源锁订阅并原子退款，不猜测最近订阅", async () => {
    const e = env();
    expect(await e.run()).toMatchObject({ found: true, reversed: true });
    expect(e.write.findSubscriptionIdBySourceOrder).toHaveBeenCalledWith(e.conn, "SO1");
    expect(e.write.refundSubscription).toHaveBeenCalledWith(e.conn, 11);
    expect(e.statements.join(" ")).not.toMatch(/crm_user_subscriptions|crm_user_entitlements|membership_tier/);
    expect(e.conn.commit).toHaveBeenCalledOnce();
  });
  it.each(["pending", "refunded", "closed"])("状态%s不重复回收", async status => {
    const e = env(status);
    expect(await e.run()).toMatchObject({ reversed: false });
    expect(e.write.refundSubscription).not.toHaveBeenCalled();
  });
  it("已付款但缺订阅时显式报错，不回退旧表", async () => {
    const e = env("paid", null);
    await expect(e.run()).rejects.toThrow("REFUND_SUBSCRIPTION_NOT_FOUND");
    expect(e.conn.rollback).toHaveBeenCalledOnce();
    expect(e.conn.commit).not.toHaveBeenCalled();
  });
  it("冻池失败回滚订单状态", async () => {
    const e = env(); e.write.refundSubscription.mockRejectedValueOnce(new Error("FREEZE_FAILED"));
    await expect(e.run()).rejects.toThrow("FREEZE_FAILED");
    expect(e.conn.rollback).toHaveBeenCalledOnce();
  });
  it("存在关联资金订单时回收权益但明确待人工核对", async () => {
    const e = env("paid", 11, true);
    expect(await e.run()).toMatchObject({ found: true, reversed: false, review_required: true });
    expect(e.write.refundSubscription).toHaveBeenCalledOnce();
  });
});
