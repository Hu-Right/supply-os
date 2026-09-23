/**
 * 权益体系双轨接线单测（activate / mock / reverse × 新表组履约依赖）
 *
 * 钉四件事：
 * 1. plan_code 命中新目录（crm_plan_catalog）→ 只走新表组履约，一条旧三表 SQL 都不许发；
 * 2. 未命中新目录（旧套餐码）→ 旧路径逐字节保持不变，新表组依赖零调用（现状：收银台
 *    仍以旧目录定价，线上流量全部落在这里）；
 * 3. 新目录码的升级单必须显眼地炸出来（升级承接未接线），不得静默落入旧升级链；
 * 4. 逆向按 source_order_no 锚点分流：命中→refundSubscription（冻池+refunded 同事务）；
 *    未命中→旧回收链。履约失败（如目录已下架）→ 回滚且不把订单标成已履约。
 */
import { describe, it, expect, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import { activatePaidOrder } from "@/lib/payment/activate";
import { fulfillMockPayment } from "@/lib/payment/mock";
import { reverseFulfilledOrder } from "@/lib/payment/reverse";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";
import type { MembershipRepo } from "@/lib/repos/membership.repo";
import type { BenefitSystemRepo, PlanCatalogRow } from "@/lib/repos/benefit-system.repo";

vi.mock("server-only", () => ({}));

const norm = (s: unknown) => String(s).replace(/\s+/g, " ").trim();

function makeOrder(over: Partial<Record<string, unknown>> = {}) {
  return {
    order_no: "SO20260923DUAL",
    user_id: 7,
    plan_code: "business",
    order_type: "new",
    original_order_no: null,
    notice_id: null,
    amount: "8800.00",
    status: "pending",
    ...over,
  };
}

/** 记录 execute/query 的伪事务连接；query 固定回 DATE_ADD 到期时间 */
function makeConn(opts: { queryRows?: unknown[] } = {}) {
  const executed: Array<{ sql: string; params: unknown[] }> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      executed.push({ sql: norm(sql), params });
      return [{ affectedRows: 1, insertId: 501 }, []];
    }),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      executed.push({ sql: norm(sql), params });
      if (norm(sql).includes("original_order_no")) return [[], []];
      return [opts.queryRows ?? [{ expires_at: new Date(1800000000000) }], []];
    }),
  };
  return { conn: conn as unknown as PoolConnection, executed };
}

function makeBenefitDeps(catalogPlan: PlanCatalogRow | null) {
  const catalog = {
    getPlan: vi.fn(async () => catalogPlan),
  } as unknown as BenefitSystemRepo;
  const write = {
    insertSubscription: vi.fn(async () => 501),
    ensureOwnerSeat: vi.fn(async () => undefined),
    grantQuotaPoolsForPlan: vi.fn(async () => ({ granted: ["notice_view"], anomalies: [] })),
    findSubscriptionIdBySourceOrder: vi.fn(async () => null as number | null),
    refundSubscription: vi.fn(async () => ({ frozenPools: 2 })),
  };
  return { deps: { catalog, write } as unknown as Parameters<typeof activatePaidOrder>[3], write };
}

const newCatalogPlan = (over: Partial<PlanCatalogRow> = {}): PlanCatalogRow => ({
  plan_code: "business",
  name_en: "BUSINESS",
  name_zh: "企业智能版",
  positioning_zh: "x",
  price: "8800.00" as unknown as string,
  price_mode: "fixed",
  price_incl_tax: null,
  currency: "CNY",
  billing_period_days: 365,
  seat_limit: 3,
  commercial_tier: "L3",
  cta_i18n_key: "ctaBusiness",
  badge: "none",
  sort_order: 4,
  is_active: 1,
  ...over,
});

const hasSql = (executed: Array<{ sql: string }>, fragment: string) =>
  executed.some((e) => e.sql.includes(fragment));

describe("activatePaidOrder · 双轨分流", () => {
  it("新目录码：走订阅事实+席位+开池，一条旧三表 SQL/方法都不出现", async () => {
    const { conn, executed } = makeConn();
    const repo = {
      getConnection: vi.fn(async () => conn),
      findOrderForUpdate: vi.fn(async () => makeOrder()),
      markAsPaidInTransaction: vi.fn(async () => undefined),
      findPlanInTransaction: vi.fn(async () => null),
      hasEntitlementForOrder: vi.fn(async () => false),
    } as unknown as PaymentsRepo;
    const { deps, write } = makeBenefitDeps(newCatalogPlan());

    await activatePaidOrder(repo, "SO20260923DUAL", "TRADE-1", deps);

    // 新链路：订阅→席位→开池（真实 grantSubscriptionForPlan 在编排），到期走 DB 时钟
    expect(write.insertSubscription).toHaveBeenCalledOnce();
    const subParam = (write.insertSubscription as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      sourceOrderNo: string;
      pricePaid: number;
    };
    expect(subParam.sourceOrderNo).toBe("SO20260923DUAL");
    expect(subParam.pricePaid).toBe(8800);
    expect(write.ensureOwnerSeat).toHaveBeenCalledOnce();
    expect(write.grantQuotaPoolsForPlan).toHaveBeenCalledOnce();
    expect(hasSql(executed, "DATE_ADD(NOW(), INTERVAL ? DAY)")).toBe(true);
    expect(conn.commit).toHaveBeenCalledOnce();
    // 旧路径的方法与 SQL 一律不得出现
    expect(repo.findPlanInTransaction).not.toHaveBeenCalled();
    expect(repo.hasEntitlementForOrder).not.toHaveBeenCalled();
    for (const legacy of ["crm_user_subscriptions", "crm_user_entitlements", "membership_tier"]) {
      expect(hasSql(executed, legacy)).toBe(false);
    }
  });

  it("旧套餐码（未命中新目录）：旧路径原样执行，新表组零调用", async () => {
    const { conn, executed } = makeConn();
    const repo = {
      getConnection: vi.fn(async () => conn),
      findOrderForUpdate: vi.fn(async () => makeOrder({ plan_code: "personal_std_999" })),
      markAsPaidInTransaction: vi.fn(async () => undefined),
      findPlanInTransaction: vi.fn(async () => ({ plan_type: "subscription", unlock_quota: 100, duration_days: 365 })),
      hasEntitlementForOrder: vi.fn(async () => false),
      createSubscriptionInTransaction: vi.fn(async () => undefined),
      insertEntitlementInTransaction: vi.fn(async () => undefined),
      promoteToVipInTransaction: vi.fn(async () => undefined),
    } as unknown as PaymentsRepo;
    const { deps, write } = makeBenefitDeps(null);

    await activatePaidOrder(repo, "SO20260923DUAL", "TRADE-1", deps);

    expect(repo.createSubscriptionInTransaction).toHaveBeenCalledOnce();
    expect(repo.insertEntitlementInTransaction).toHaveBeenCalledOnce();
    expect(repo.promoteToVipInTransaction).toHaveBeenCalledOnce();
    expect(write.insertSubscription).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalledOnce();
    void executed;
  });

  it("新目录码 × upgrade：必须抛出 UPGRADE_ON_NEW_CATALOG_NOT_WIRED 并回滚", async () => {
    const { conn } = makeConn();
    const repo = {
      getConnection: vi.fn(async () => conn),
      findOrderForUpdate: vi.fn(async () => makeOrder({ order_type: "upgrade" })),
      markAsPaidInTransaction: vi.fn(async () => undefined),
    } as unknown as PaymentsRepo;
    const { deps } = makeBenefitDeps(newCatalogPlan());

    await expect(activatePaidOrder(repo, "SO20260923DUAL", undefined, deps)).rejects.toThrow(
      /UPGRADE_ON_NEW_CATALOG_NOT_WIRED/,
    );
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("目录脏数据（已下架码成交）：grant 抛错→回滚，绝不静默标成已履约", async () => {
    const { conn } = makeConn();
    const repo = {
      getConnection: vi.fn(async () => conn),
      findOrderForUpdate: vi.fn(async () => makeOrder()),
      markAsPaidInTransaction: vi.fn(async () => undefined),
    } as unknown as PaymentsRepo;
    const { deps } = makeBenefitDeps(newCatalogPlan({ is_active: 0 }));

    await expect(activatePaidOrder(repo, "SO20260923DUAL", undefined, deps)).rejects.toMatchObject({
      code: "PLAN_NOT_SELLABLE",
    });
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

describe("fulfillMockPayment · 双轨分流（开发/测试环境同链）", () => {
  it("新目录码：mock  paid 与 grant 同事务，旧权益方法零调用", async () => {
    const { conn, executed } = makeConn();
    const payments = {
      findByOrderNo: vi.fn(async () => makeOrder()),
      getConnection: vi.fn(async () => conn),
      markAsMockPaidInTransaction: vi.fn(async () => undefined),
      insertEntitlementInTransaction: vi.fn(async () => undefined),
      createSubscriptionInTransaction: vi.fn(async () => undefined),
    } as unknown as PaymentsRepo;
    const membership = {
      findPlanByCodeForFulfillment: vi.fn(async () => null),
    } as unknown as MembershipRepo;
    const { deps, write } = makeBenefitDeps(newCatalogPlan());

    await fulfillMockPayment(payments, membership, { orderNo: "SO20260923DUAL", rawNotify: "{}" }, deps);

    expect(payments.markAsMockPaidInTransaction).toHaveBeenCalledOnce();
    expect(write.insertSubscription).toHaveBeenCalledOnce();
    expect(payments.insertEntitlementInTransaction).not.toHaveBeenCalled();
    expect(hasSql(executed, "crm_user_entitlements")).toBe(false);
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it("不传依赖（旧语义回归）：仍走旧三表发放链", async () => {
    const { conn } = makeConn();
    const payments = {
      findByOrderNo: vi.fn(async () => makeOrder({ plan_code: "personal_std_999" })),
      getConnection: vi.fn(async () => conn),
      markAsMockPaidInTransaction: vi.fn(async () => undefined),
      insertEntitlementInTransaction: vi.fn(async () => undefined),
      createSubscriptionInTransaction: vi.fn(async () => undefined),
      promoteToVipInTransaction: vi.fn(async () => undefined),
    } as unknown as PaymentsRepo;
    const membership = {
      findPlanByCodeForFulfillment: vi.fn(async () => ({ unlock_quota: 100, duration_days: 365, plan_type: "subscription" })),
    } as unknown as MembershipRepo;

    await fulfillMockPayment(payments, membership, { orderNo: "SO20260923DUAL", rawNotify: "{}" });

    expect(payments.insertEntitlementInTransaction).toHaveBeenCalledOnce();
    expect(payments.createSubscriptionInTransaction).toHaveBeenCalledOnce();
  });
});

describe("reverseFulfilledOrder · 双轨分流", () => {
  function makeReverseEnv(order: ReturnType<typeof makeOrder> | null) {
    const { conn, executed } = makeConn({ queryRows: [] });
    const repo = {
      getConnection: vi.fn(async () => conn),
      findOrderForUpdate: vi.fn(async () => order && { ...order, status: "paid" }),
    } as unknown as PaymentsRepo;
    return { conn, executed, repo };
  }

  it("新表组履过约的订单：冻池+订阅 refunded，同事务，旧回收链 SQL 零出现", async () => {
    const { repo, executed } = makeReverseEnv(makeOrder());
    const { deps, write } = makeBenefitDeps(null);
    (write.findSubscriptionIdBySourceOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(77);

    const result = await reverseFulfilledOrder(repo, "SO20260923DUAL", deps);

    expect(result).toEqual({ found: true, reversed: true });
    expect(write.findSubscriptionIdBySourceOrder).toHaveBeenCalledOnce();
    expect(write.refundSubscription).toHaveBeenCalledOnce();
    expect((write.refundSubscription as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(77);
    // 订单标 refunded 发生了（第一道守卫），但旧三表回收 SQL 一律没有
    expect(hasSql(executed, "crm_payment_orders SET status = 'refunded'")).toBe(true);
    for (const legacy of ["crm_user_entitlements", "crm_user_subscriptions", "membership_tier"]) {
      expect(hasSql(executed, legacy)).toBe(false);
    }
  });

  it("未在新表组落账（旧套餐单）：继续旧回收链，新账本方法不改写行为", async () => {
    const { repo, executed } = makeReverseEnv(makeOrder({ plan_code: "personal_std_999" }));
    const { deps, write } = makeBenefitDeps(null);

    const result = await reverseFulfilledOrder(repo, "SO20260923DUAL", deps);

    expect(result).toEqual({ found: true, reversed: true });
    expect(write.refundSubscription).not.toHaveBeenCalled();
    expect(hasSql(executed, "crm_user_entitlements")).toBe(true);
    expect(hasSql(executed, "crm_user_subscriptions")).toBe(true);
    expect(hasSql(executed, "membership_tier = 'free'")).toBe(true);
  });

  it("不传依赖（现状回归）：旧订单逆向行为与接入前逐字一致", async () => {
    const { repo, executed } = makeReverseEnv(makeOrder({ plan_code: "personal_std_999" }));

    const result = await reverseFulfilledOrder(repo, "SO20260923DUAL");

    expect(result).toEqual({ found: true, reversed: true });
    expect(hasSql(executed, "crm_user_entitlements")).toBe(true);
  });
});
