/**
 * 退款逆向回收测试（审查报告 F20）
 * TRADE_CLOSED 通知 → reverseFulfilledOrder 按订单类型回收已发放权益。
 */
import { describe, it, expect, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";

vi.mock("server-only", () => ({}));

function makeOrder(over: Partial<Record<string, unknown>> = {}) {
  return {
    order_no: "SO20260830TEST",
    user_key: "13800000000",
    plan_code: "annual_8",
    order_type: "new",
    status: "paid",
    ...over,
  };
}

function makeEnv(order: ReturnType<typeof makeOrder> | null, flagAffectedRows = 1, linkedOrder: { order_no: string } | null = null) {
  const executed: Array<{ sql: string; params: unknown[] }> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      executed.push({ sql, params: params ?? [] });
      return [{ affectedRows: flagAffectedRows }];
    }),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      executed.push({ sql, params: params ?? [] });
      // mysql2 返回 [rows, fields]；抵扣关联查询按需返回行，其余返回空集
      if (sql.includes("original_order_no")) {
        return [linkedOrder ? [linkedOrder] : []];
      }
      return [[]];
    }),
  } as unknown as PoolConnection;
  const repo = {
    getConnection: vi.fn().mockResolvedValue(conn),
    findOrderForUpdate: vi.fn().mockResolvedValue(order),
  } as unknown as PaymentsRepo;
  return { conn, repo, executed };
}

const hasSql = (executed: Array<{ sql: string }>, fragment: string) =>
  executed.some((e) => e.sql.includes(fragment));

describe("reverseFulfilledOrder 退款逆向（F20）", () => {
  it("会员套餐订单：权益与订阅标记 refunded，无其他活跃订阅时降级 free", async () => {
    const { repo, executed } = makeEnv(makeOrder());
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO20260830TEST");

    expect(result).toEqual({ found: true, reversed: true });
    expect(hasSql(executed, "SET status = 'refunded'")).toBe(true);
    expect(hasSql(executed, "crm_user_entitlements")).toBe(true);
    expect(hasSql(executed, "crm_user_subscriptions")).toBe(true);
    expect(hasSql(executed, "membership_tier = 'free'")).toBe(true);
    expect(hasSql(executed, "crm_learning_material_purchases")).toBe(false);
  });

  it("学习资料订单：删除购买记录，不触达权益/订阅", async () => {
    const { repo, executed } = makeEnv(makeOrder({ plan_code: "material_training-doc-01" }));
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO20260830TEST");

    expect(result.reversed).toBe(true);
    expect(hasSql(executed, "DELETE FROM crm_learning_material_purchases")).toBe(true);
    expect(hasSql(executed, "crm_user_entitlements")).toBe(false);
    expect(hasSql(executed, "crm_user_subscriptions")).toBe(false);
  });

  it("升级订单：标记 refunded 但不自动回滚权益（转人工）", async () => {
    const { repo, executed } = makeEnv(makeOrder({ order_type: "upgrade" }));
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO20260830TEST");

    expect(result.reversed).toBe(true);
    expect(hasSql(executed, "SET status = 'refunded'")).toBe(true);
    expect(hasSql(executed, "crm_user_entitlements")).toBe(false);
  });

  it("非 paid 状态（重复通知/未支付）：幂等跳过，不产生任何写入", async () => {
    const { repo, executed } = makeEnv(makeOrder({ status: "refunded" }));
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO20260830TEST");

    expect(result).toEqual({ found: true, reversed: false });
    expect(executed).toHaveLength(0);
  });

  it("订单不存在：found=false", async () => {
    const { repo } = makeEnv(null);
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO-NOT-EXIST");
    expect(result).toEqual({ found: false, reversed: false });
  });

  it("订单标记条件更新未命中（并发已处理）：幂等跳过", async () => {
    const { repo, executed } = makeEnv(makeOrder(), 0);
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO20260830TEST");

    expect(result).toEqual({ found: true, reversed: false });
    expect(executed).toHaveLength(1);
  });

  it("被抵扣引用的源订单（首单抵扣配套）：标记 refunded 但权益保留转人工", async () => {
    const { repo, executed } = makeEnv(makeOrder({ plan_code: "single_99" }), 1, { order_no: "SO-MEMBER-700" });
    const { reverseFulfilledOrder } = await import("@/lib/payment/fulfillment");
    const result = await reverseFulfilledOrder(repo, "SO20260830TEST");

    // 订单已标 refunded，但不应出现权益回收/购买记录删除/降级 SQL
    expect(result).toEqual({ found: true, reversed: false });
    expect(hasSql(executed, "SET status = 'refunded'")).toBe(true);
    expect(hasSql(executed, "crm_learning_material_purchases")).toBe(false);
    expect(hasSql(executed, "membership_tier = 'free'")).toBe(false);
  });
});
