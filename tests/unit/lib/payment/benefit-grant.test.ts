/**
 * 履约服务单测（benefit-grant）
 *
 * 锁四件事：
 * 1. 落库顺序与快照来源（席位、开池都必须在订阅之后，seat_limit/currency 取目录快照）；
 * 2. 三条拒绝路径必须"发 SQL 之前就拒"，且不可自助成交的档位（contact / 已下架）逐一分清；
 * 3. expires_at 走 DB 时钟（DATE_ADD），永久档不发这条查询；
 * 4. 目录口径矛盾（price_incl_tax 全 NULL 却写着"未定前禁止开单"）必须冒出来，
 *    而不是静默放行或静默停摆。
 */
import { describe, it, expect, vi } from "vitest";
import { GrantError, grantSubscriptionForPlan } from "@/lib/payment/benefit-grant";
import type { BenefitSystemRepo, PlanCatalogRow } from "@/lib/repos/benefit-system.repo";

const plan = (over: Partial<PlanCatalogRow> = {}): PlanCatalogRow => ({
  plan_code: "business",
  name_en: "BUSINESS",
  name_zh: "企业智能版",
  positioning_zh: "x",
  price: "8800.00" as unknown as string,
  price_mode: "fixed",
  price_incl_tax: 1,
  currency: "CNY",
  billing_period_days: 365,
  seat_limit: 3,
  commercial_tier: "L3",
  cta_i18n_key: "ctaX",
  badge: "none",
  sort_order: 4,
  is_active: 1,
  ...over,
});

/** 记录调用序列的伪事务连接：只关心有没有发 DATE_ADD、参数是什么 */
function makeConn(expiresAt: Date = new Date(1900000000000)) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      return [[{ expires_at: expiresAt }], []];
    },
  };
  return { conn: conn as never, calls };
}

function makeDeps(opts: { plan?: PlanCatalogRow | null; grant?: { granted: string[]; anomalies: string[] } } = {}) {
  const order: string[] = [];
  const catalog = {
    getPlan: vi.fn(async () => (opts.plan === undefined ? plan() : opts.plan)),
  } as unknown as BenefitSystemRepo;
  const write = {
    insertSubscription: vi.fn(async (_db: unknown, p: { seatLimit: number; currency?: string; sourceOrderNo: string; pricePaid: number }) => {
      order.push("insertSubscription");
      order.push(`sub:${p.sourceOrderNo}/${p.pricePaid}/${p.currency}/${p.seatLimit}`);
      return 501;
    }),
    ensureOwnerSeat: vi.fn(async (_db: unknown, p: { subscriptionId: number; ownerUserId: number }) => {
      order.push(`seat:${p.subscriptionId}/${p.ownerUserId}`);
    }),
    grantQuotaPoolsForPlan: vi.fn(async () => {
      order.push("grantPools");
      return opts.grant ?? { granted: ["notice_view"], anomalies: [] };
    }),
  };
  return { deps: { catalog, write } as never, order };
}

const base = { userId: 42, orderNo: "ALI-20260923-0001", planCode: "business", pricePaid: 8800 };

describe("grantSubscriptionForPlan · 正常履约", () => {
  it("顺序：订阅 → 主账号席位 → 按矩阵开池", async () => {
    const { deps, order } = makeDeps();
    const { conn, calls } = makeConn();
    const r = await grantSubscriptionForPlan(deps, conn, base);

    expect(order).toEqual([
      "insertSubscription",
      "sub:ALI-20260923-0001/8800/CNY/3",
      "seat:501/42",
      "grantPools",
    ]);
    expect(r.subscriptionId).toBe(501);
    // 席位与开池都挂在刚插入的订阅上：顺序错就会开出一张无主池
    expect(order.indexOf("seat:501/42")).toBeLessThan(order.indexOf("grantPools"));
    // expires_at 由 DB 时钟算，不用应用 new Date()
    expect(calls[0].sql).toContain("DATE_ADD(NOW(), INTERVAL ? DAY)");
    expect(calls[0].params).toEqual([365]);
  });

  it("实付与标价可以不等（升级补差场景原样入库）", async () => {
    const { deps, order } = makeDeps();
    const { conn } = makeConn();
    await grantSubscriptionForPlan(deps, conn, { ...base, pricePaid: 2400.5 });
    expect(order[1]).toContain("/2400.5/");
  });

  it("币种缺省取目录快照，显式传入优先", async () => {
    const a = makeDeps();
    await grantSubscriptionForPlan(a.deps, makeConn().conn, base);
    expect(a.order[1]).toContain("/CNY/");

    const b = makeDeps();
    await grantSubscriptionForPlan(b.deps, makeConn().conn, { ...base, currency: "USD" });
    expect(b.order[1]).toContain("/USD/");
  });

  it("永久档（billing_period_days=NULL）不发 DATE_ADD，expires_at 为 null", async () => {
    const { deps } = makeDeps({ plan: plan({ billing_period_days: null }) });
    const { conn, calls } = makeConn();
    const r = await grantSubscriptionForPlan(deps, conn, base);
    expect(calls).toHaveLength(0);
    expect(r.expiresAt).toBeNull();
  });
});

describe("grantSubscriptionForPlan · 拒绝路径不得留下半成品", () => {
  it("缺订单号：抛 ORDER_NO_MISSING，且一条 SQL 都不发", async () => {
    const { deps, order } = makeDeps();
    const { conn, calls } = makeConn();
    await expect(grantSubscriptionForPlan(deps, conn, { ...base, orderNo: "   " })).rejects.toMatchObject({
      code: "ORDER_NO_MISSING",
    });
    expect(order).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("目录无此码 → PLAN_NOT_FOUND；码存在但已下架 → PLAN_NOT_SELLABLE（两者必须可区分）", async () => {
    const missing = makeDeps({ plan: null });
    await expect(grantSubscriptionForPlan(missing.deps, makeConn().conn, base)).rejects.toBeInstanceOf(GrantError);
    await expect(grantSubscriptionForPlan(missing.deps, makeConn().conn, base)).rejects.toMatchObject({
      code: "PLAN_NOT_FOUND",
    });

    const offShelf = makeDeps({ plan: plan({ is_active: 0 }) });
    await expect(grantSubscriptionForPlan(offShelf.deps, makeConn().conn, base)).rejects.toMatchObject({
      code: "PLAN_NOT_SELLABLE",
    });
    expect(offShelf.order).toEqual([]);
  });

  it("contact 档不得自助成交：price_paid 是 NOT NULL 财务快照，不能拿 0 冒充", async () => {
    const { deps, order } = makeDeps({ plan: plan({ price_mode: "contact", price_incl_tax: null }) });
    await expect(grantSubscriptionForPlan(deps, makeConn().conn, { ...base, pricePaid: 0 })).rejects.toMatchObject({
      code: "PLAN_NOT_SELLABLE",
    });
    expect(order).toEqual([]);
  });

  it("计费周期为 0 或负数属目录脏数据，宁可拒绝也不发即刻到期的订阅", async () => {
    for (const days of [0, -1]) {
      const { deps, order } = makeDeps({ plan: plan({ billing_period_days: days }) });
      await expect(grantSubscriptionForPlan(deps, makeConn().conn, base)).rejects.toMatchObject({
        code: "PLAN_NOT_SELLABLE",
      });
      expect(order).toEqual([]);
    }
  });
});

describe("grantSubscriptionForPlan · 矛盾必须冒出来", () => {
  it("price_incl_tax 为 NULL：照常履约但必须回报口径冲突（注释要求未定前禁止开单）", async () => {
    const { deps } = makeDeps({ plan: plan({ price_incl_tax: null }) });
    const r = await grantSubscriptionForPlan(deps, makeConn().conn, base);
    expect(r.subscriptionId).toBe(501);
    expect(r.anomalies.join(" ")).toContain("禁止开单");
  });

  it("矩阵缺格/异常格由写层透传，不在履约层悄悄吞掉", async () => {
    const { deps } = makeDeps({
      grant: { granted: ["notice_view"], anomalies: ["tech_support：矩阵缺格（套餐 business 未声明额度），不发池"] },
    });
    const r = await grantSubscriptionForPlan(deps, makeConn().conn, base);
    expect(r.grantedBenefits).toEqual(["notice_view"]);
    expect(r.anomalies.join(" ")).toContain("矩阵缺格");
  });

  it("口径干净时 anomalies 必须为空——避免真问题被固定噪音淹没", async () => {
    const { deps } = makeDeps();
    const r = await grantSubscriptionForPlan(deps, makeConn().conn, base);
    expect(r.anomalies).toEqual([]);
  });
});
