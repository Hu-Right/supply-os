/**
 * VIP 判定唯一端口语义固化测试
 * Membership state SSOT — semantic pin tests
 *
 * @description Phase 0.1（2026-08-20，方案 B 瘦身版）：以测试钉住 §2.0 产品语义裁决——
 *              R1 身份与额度分离：VIP 是订阅身份，单次解锁卡只授予额度、不授予身份；
 *              R2 期限基准：VIP 按会员期限判定，配额耗尽不影响 VIP，到期自动失效；
 *              R3 免费用户：无订阅即 free，免费预览额度与 VIP 无关。
 *              画像 2 与画像 4 为反直觉断言（与旧口径 B/C 相反），
 *              修改前必须阅读《VIP判定SSOT系统性方案设计.md》§2.0 裁决全文。
 */
import { describe, it, expect } from "vitest";
import { resolveMembershipState } from "@/lib/services/membership-status";
import type { MembershipRepo, CurrentBestPlanRow } from "@/lib/repos/membership.repo";
import type { SubscriptionRow, EntitlementRow } from "@/lib/repos/types";

// ── 测试工厂 ─────────────────────────────────────────────────────────────────

function makeSub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 1,
    user_id: null,
    user_key: "u-test",
    plan_code: "week_21",
    plan_name: "标讯企业会员-基础版",
    unlock_quota: 10,
    status: "active",
    started_at: new Date("2026-08-01"),
    expires_at: new Date("2026-09-01"),
    created_at: new Date("2026-08-01"),
    ...overrides,
  };
}

function makeEntitlement(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    id: 100,
    user_id: null,
    user_key: "u-test",
    source_order_no: "ORD-TEST",
    plan_code: "single_89",
    quota_total: 5,
    quota_used: 2,
    quota_remaining: 3,
    status: "active",
    started_at: new Date("2026-08-01"),
    expires_at: null,
    ...overrides,
  };
}

/** 结构化 mock：只覆盖 resolveMembershipState 消费的六个数据原语 */
function makeRepo(data: {
  subs?: SubscriptionRow[];
  entitlements?: EntitlementRow[];
  freeQuota?: number;
  freeUsed?: number;
  paidUnlocks?: number;
  currentBest?: CurrentBestPlanRow | null;
}): MembershipRepo {
  return {
    getFreeQuota: async () => data.freeQuota ?? 3,
    countFreeUnlocks: async () => data.freeUsed ?? 0,
    findActiveSubscriptions: async () => data.subs ?? [],
    countPaidUnlocks: async () => data.paidUnlocks ?? 0,
    // 模拟真实 Repo 的过滤语义：只返回有剩余配额且未过期的权益
    findActiveEntitlements: async () =>
      (data.entitlements ?? []).filter((e) => e.quota_remaining > 0),
    findCurrentBestPlan: async () => data.currentBest ?? null,
  } as unknown as MembershipRepo;
}

const USER = 1; // userId (was "u-test" userKey)

// ── 7 画像回归用例 ────────────────────────────────────────────────────────────

describe("resolveMembershipState — §2.0 语义裁决固化", () => {
  it("画像 1：期限内活跃订阅 → isVip=true（R2 期限基准）", async () => {
    const repo = makeRepo({ subs: [makeSub()] });
    const state = await resolveMembershipState(repo, USER);
    expect(state.isVip).toBe(true);
    expect(state.tier).toBe("vip");
  });

  it("画像 2：仅单次解锁卡（有剩余额度、无订阅）→ isVip=false（§2.0 R1：额度≠身份）", async () => {
    // 反直觉断言：旧口径 B/C 曾判 vip，产品裁决 R1 明确单次卡只授予额度、不授予身份。
    // 修改本断言前必须阅读《VIP判定SSOT系统性方案设计.md》§2.0。
    const repo = makeRepo({ entitlements: [makeEntitlement()] });
    const state = await resolveMembershipState(repo, USER);
    expect(state.isVip).toBe(false);
    expect(state.tier).toBe("free");
    // 身份与额度解耦验证：无 VIP 身份但付费额度完好（解锁能力不受影响）
    expect(state.paidQuotaRemaining).toBe(3);
  });

  it("画像 3：订阅已过期（Repo 过滤后无活跃订阅）→ isVip=false（R2 到期失效）", async () => {
    // findActiveSubscriptions 已内置 expires_at > NOW() 过滤，过期订阅不会返回
    const repo = makeRepo({ subs: [] });
    const state = await resolveMembershipState(repo, USER);
    expect(state.isVip).toBe(false);
    expect(state.tier).toBe("free");
  });

  it("画像 4：订阅期限内但付费配额耗尽 → isVip=true（§2.0 R2：期限≠额度）", async () => {
    // 反直觉断言：旧口径 B 曾判 free（额度基准），产品裁决 R2 明确配额耗尽不影响 VIP，
    // 到期才失效。修改本断言前必须阅读《VIP判定SSOT系统性方案设计.md》§2.0。
    const repo = makeRepo({
      subs: [makeSub({ unlock_quota: 10 })],
      paidUnlocks: 10, // 订阅配额已全部用完 → paidQuotaRemaining = 0
    });
    const state = await resolveMembershipState(repo, USER);
    expect(state.paidQuotaRemaining).toBe(0); // 边界确认：额度确实耗尽
    expect(state.isVip).toBe(true);           // 身份不受额度影响
    expect(state.tier).toBe("vip");
  });

  it("画像 5：无任何权益 → isVip=false（R3 免费用户）", async () => {
    const repo = makeRepo({});
    const state = await resolveMembershipState(repo, USER);
    expect(state.isVip).toBe(false);
    expect(state.tier).toBe("free");
    // R3：免费预览额度是独立机制，与 VIP 判定无关
    expect(state.freeQuota).toBe(3);
    expect(state.freeRemaining).toBe(3);
  });

  it("画像 6：多张有效订阅 → isVip=true，最优套餐由 findCurrentBestPlan 透出", async () => {
    const best: CurrentBestPlanRow = {
      entitlement_id: null,
      subscription_id: 2,
      source_order_no: null,
      plan_code: "annual",
      plan_name: "标讯企业会员-旗舰版",
      price: 999,
      unlock_quota: 100,
      quota_used: 0,
      quota_total: null,
      started_at: null,
      expires_at: null,
    };
    const repo = makeRepo({
      subs: [makeSub({ id: 1, plan_code: "week_21" }), makeSub({ id: 2, plan_code: "annual" })],
      currentBest: best,
    });
    const state = await resolveMembershipState(repo, USER);
    expect(state.isVip).toBe(true);
    expect(state.activeSubscriptions).toHaveLength(2);
    expect(state.currentBest?.plan_code).toBe("annual"); // 最优套餐透传（升级判断依据）
  });

  it("画像 7：免费套餐订阅（DB 存在活跃订阅行）→ isVip=true（规则派生语义钉住）", async () => {
    // 表达式语义钉住：判定只问"是否存在期限内活跃订阅行"，不按 plan_code 区分。
    // 当前业务不会为 free 套餐创建订阅行（免费用户无行），本画像防御未来业务变更：
    // 若届时产品裁定免费套餐订阅不应授予 VIP，须先修订 §2.0 裁决再改表达式与本案。
    const repo = makeRepo({ subs: [makeSub({ plan_code: "free", unlock_quota: 0 })] });
    const state = await resolveMembershipState(repo, USER);
    expect(state.isVip).toBe(true);
    expect(state.tier).toBe("vip");
  });
});
