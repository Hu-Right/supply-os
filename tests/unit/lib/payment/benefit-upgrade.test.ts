import { describe, it, expect, vi, beforeEach } from "vitest";
import { performUpgradeInTransaction } from "@/lib/payment/upgrade";
import { grantSubscriptionForPlan } from "@/lib/payment/benefit-grant";
import type { BenefitFulfillDeps } from "@/lib/payment/benefit-grant";
import type { PoolConnection } from "mysql2/promise";
import type { PaymentOrderRow } from "@/lib/repos/types";
vi.mock("@/lib/payment/benefit-grant", () => ({ grantSubscriptionForPlan: vi.fn() }));
beforeEach(() => vi.mocked(grantSubscriptionForPlan).mockResolvedValue({ subscriptionId: 22, planCode: "pro", expiresAt: new Date("2030-01-01"), grantedBenefits: ["notice_view"] }));

function env(over: Record<string, unknown> = {}, targetTotal = 100) {
  const source = { id: 11, owner_user_id: 7, plan_code: "starter", source_order_no: "SO0", status: "active", is_current: 1, currency: "CNY", started_at: new Date("2026-01-01"), expires_at: new Date("2030-01-01"), ...over };
  const pools = [{ benefit_code: "notice_view", quota_used: 8, status: "active" }];
  const conn = { query: vi.fn(async () => [pools]), execute: vi.fn(async () => [{ affectedRows: 1 }]) };
  const deps = {
    catalog: { getPlan: vi.fn(async (code: string) => ({ plan_code: code, price: code === "starter" ? "129.00" : "999.00", currency: "CNY", is_active: 1, price_mode: "fixed" })) },
    write: {
      findSubscriptionIdBySourceOrder: vi.fn(async () => 11),
      findSubscriptionForUpdate: vi.fn(async () => source),
      findAndLockCurrentPool: vi.fn(async () => ({ id: 33, quota_total: targetTotal })),
      freezePoolsOfSubscription: vi.fn(), linkReplacedSubscription: vi.fn(),
    },
  };
  const order = { order_no: "SO1", original_order_no: "SO0", user_id: 7, plan_code: "pro", amount: 870, currency: "CNY", raw_request: JSON.stringify({ upgrade_snapshot: { subscription_id: 11, current_plan_code: "starter", target_plan_code: "pro", current_price: 129, target_price: 999 } }) };
  const run = () => performUpgradeInTransaction(conn as unknown as PoolConnection, deps as unknown as BenefitFulfillDeps, order as PaymentOrderRow);
  return { run, conn, deps, source, order };
}
describe("新订阅升级", () => {
  it("保留原有效期和已用量，冻结旧池并链接替代订阅", async () => {
    const e = env(); await e.run();
    expect(grantSubscriptionForPlan).toHaveBeenCalledWith(expect.anything(), e.conn, expect.objectContaining({ startedAt: e.source.started_at, expiresAt: e.source.expires_at, pricePaid: 870 }));
    expect(e.conn.execute.mock.calls[0]).toEqual(expect.arrayContaining([expect.stringContaining("quota_used"), [8, 33]]));
    expect(e.deps.write.freezePoolsOfSubscription).toHaveBeenCalledWith(e.conn, 11);
    expect(e.deps.write.linkReplacedSubscription).toHaveBeenCalledWith(e.conn, { oldSubscriptionId: 11, newSubscriptionId: 22 });
  });
  it.each([{ owner_user_id: 9 }, { status: "refunded" }, { is_current: 0 }])("来源不可升级时拒绝 %o", async over => {
    await expect(env(over).run()).rejects.toThrow("UPGRADE_SOURCE_INVALID");
  });
  it("快照缺失或金额漂移必须拒绝", async () => {
    const a = env(); a.order.raw_request = "{}";
    await expect(a.run()).rejects.toThrow("UPGRADE_SNAPSHOT_INVALID");
    const b = env(); b.order.amount = 1;
    await expect(b.run()).rejects.toThrow("UPGRADE_PRICE_DRIFT");
  });
  it("不限新池 used 必须为0，不违反库约束", async () => {
    const e = env({}, -1); await e.run();
    expect(e.conn.execute.mock.calls[0]).toEqual(expect.arrayContaining([[0, 33]]));
  });
  it("新额度不足以承接已用量时整笔拒绝", async () => {
    await expect(env({}, 3).run()).rejects.toThrow("UPGRADE_QUOTA_INVALID");
  });
});
