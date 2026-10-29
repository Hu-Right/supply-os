/**
 * 会员视图 mapper 单测（命名红线② 的收口点）
 *
 * @description 这里钉住两件只有 mapper 自己能保证的事：
 *              1) 键名机械 camel、值原样透传（时间仍是 Date，序列化结果不变）；
 *              2) **数据键不被当成列名改**：gates 的键是权益码（notice_view）、
 *                 对比矩阵 cells 的键是套餐码（personal_std_999），
 *                 通用深改名会把它们改掉并让前端查找恒空——这是本域最容易踩的坑。
 */
import { describe, expect, it } from "vitest";
import {
  membershipStatusViewOf,
  planViewOf,
  tieredComparisonViewOf,
  upgradePreviewViewOf,
} from "@/lib/services/membership/view";
import type { ComparisonTable, MembershipStatus, PlanCatalogRow, UpgradePreview } from "@/types/membership";

const PLAN = {
  plan_code: "personal_std_999",
  name_en: "STD",
  name_zh: "个人标准版",
  positioning_zh: "标准",
  price: "999.00",
  price_mode: "fixed",
  price_incl_tax: 999,
  currency: "CNY",
  billing_period_days: 365,
  commercial_tier: "L2",
  audience: "personal",
  cta_i18n_key: "cta_std",
  badge: "none",
  sort_order: 2,
  is_active: 1,
  upgrade_credit_days: 7,
} as unknown as PlanCatalogRow;

describe("planViewOf", () => {
  it("列名归位 camel，值原样不动", () => {
    const v = planViewOf(PLAN);
    expect(v.planCode).toBe("personal_std_999");
    expect(v.nameZh).toBe("个人标准版");
    expect(v.billingPeriodDays).toBe(365);
    expect(v.upgradeCreditDays).toBe(7);
    // 单词列保持原样
    expect(v.price).toBe("999.00");
    expect(v.currency).toBe("CNY");
    const snake = Object.keys(v).filter((k) => /[a-z0-9]_[a-z0-9]/.test(k));
    expect(snake).toEqual([]);
  });
});

describe("membershipStatusViewOf", () => {
  const status = {
    plan: PLAN,
    subscription: {
      subscription_id: 51,
      owner_user_id: 101,
      plan_code: "personal_std_999",
      source_order_no: "SO_1",
      price_paid: "999.00",
      currency: "CNY",
      started_at: new Date("2026-01-01T00:00:00.000Z"),
      expires_at: new Date("2030-01-01T00:00:00.000Z"),
    },
    quotas: [
      {
        benefit_code: "notice_view",
        quota_total: 100,
        quota_used: 3,
        status: "active",
        period_starts_at: new Date("2026-01-01T00:00:00.000Z"),
        remaining: 97,
      },
    ],
    gates: { notice_view: "included", ai_summary: "free" },
    upgrade_credit: { days: 7, open: true, deadline_at: "2026-01-08T00:00:00.000Z" },
  } as unknown as MembershipStatus;

  it("嵌套的 plan/subscription/quotas 都是视图，时间仍交给 JSON 序列化", () => {
    const v = membershipStatusViewOf(status);
    expect(v.plan.planCode).toBe("personal_std_999");
    expect(v.subscription?.subscriptionId).toBe(51);
    expect(v.subscription?.sourceOrderNo).toBe("SO_1");
    expect(v.quotas[0].benefitCode).toBe("notice_view");
    expect(v.quotas[0].periodStartsAt).toBeInstanceOf(Date);
    expect(v.upgradeCredit).toEqual({ days: 7, open: true, deadlineAt: "2026-01-08T00:00:00.000Z" });
    expect(v).not.toHaveProperty("upgrade_credit");
  });

  it("gates 的键是权益码，必须原样保留（改了前端查找恒空）", () => {
    const v = membershipStatusViewOf(status);
    expect(Object.keys(v.gates ?? {})).toEqual(["notice_view", "ai_summary"]);
    expect(v.gates?.notice_view).toBe("included");
  });

  it("无 gates / 无抵扣窗口时不下发空键（保持迁移前的省略语义）", () => {
    const bare = membershipStatusViewOf({
      plan: PLAN,
      subscription: null,
      quotas: [],
    } as unknown as MembershipStatus);
    expect(bare.subscription).toBeNull();
    expect("gates" in bare).toBe(false);
    expect("upgradeCredit" in bare).toBe(false);
  });
});

describe("tieredComparisonViewOf", () => {
  const mkPlan = (over: Partial<PlanCatalogRow>): PlanCatalogRow =>
    ({
      ...PLAN,
      plan_code: "personal_m",
      name_zh: "个人会员·月",
      price: "239.00",
      billing_period_days: 30,
      commercial_tier: "L1",
      sort_order: 2,
      ...over,
    }) as PlanCatalogRow;

  const cell = (planCode: string, benefit: string, display = "1") => ({
    plan_code: planCode,
    benefit_code: benefit,
    kind: "enum" as const,
    raw: 1,
    enabled: true,
    display,
    note: null,
  });

  const mkTable = (): ComparisonTable =>
    ({
      plans: [
        mkPlan({}),
        mkPlan({ plan_code: "personal_q", name_zh: "个人会员·季", price: "499.00", billing_period_days: 90, sort_order: 3 }),
        mkPlan({ plan_code: "personal_y", name_zh: "个人会员·年", price: "1299.00", billing_period_days: 365, sort_order: 4 }),
        mkPlan({ plan_code: "business_m", name_zh: "企业会员·月", price: "780.00", commercial_tier: "L3", sort_order: 5 }),
      ],
      rows: [
        {
          benefit: { benefit_code: "notice_view", name_zh: "标讯权益", value_kind: "quota", level_dict: null, sort_order: 1 },
          cells: {
            personal_m: cell("personal_m", "notice_view", "-1"),
            personal_q: cell("personal_q", "notice_view", "-1"),
            personal_y: cell("personal_y", "notice_view", "-1"),
            business_m: cell("business_m", "notice_view", "-1"),
          },
        },
        {
          benefit: { benefit_code: "history_notice_db", name_zh: "历史标讯库", value_kind: "enum", level_dict: null, sort_order: 2 },
          cells: {
            personal_m: cell("personal_m", "history_notice_db"),
            personal_q: cell("personal_q", "history_notice_db"),
            personal_y: cell("personal_y", "history_notice_db"),
            business_m: cell("business_m", "history_notice_db"),
          },
        },
      ],
    }) as unknown as ComparisonTable;

  it("按 commercial_tier 归组：三周期行收成一列，代表行取周期最短（*_m）行", () => {
    const v = tieredComparisonViewOf(mkTable());
    expect(v.plans.map((p) => p.planCode)).toEqual(["personal_m", "business_m"]);
    const personal = v.plans[0];
    expect(personal.periods.map((p) => p.planCode)).toEqual(["personal_m", "personal_q", "personal_y"]);
    expect(personal.periods[2].price).toBe("1299.00");
  });

  it("权益格键到代表 plan_code 上，history_notice_db 行在视图层隐藏", () => {
    const v = tieredComparisonViewOf(mkTable());
    expect(v.rows.map((r) => r.benefit.benefitCode)).toEqual(["notice_view"]);
    expect(Object.keys(v.rows[0].cells)).toEqual(["personal_m", "business_m"]);
    // 格与行都是视图形状：cells 键是套餐码（数据键不改名），格内字段 camel
    const cellView = v.rows[0].cells["personal_m"];
    expect(cellView?.planCode).toBe("personal_m");
    expect(cellView?.benefitCode).toBe("notice_view");
    expect(v.rows[0].benefit.valueKind).toBe("quota");
  });
});

describe("upgradePreviewViewOf", () => {
  it("顶层别名 camel，三个套餐/订阅字段按各自视图转换", () => {
    const preview = {
      can_upgrade: true,
      reason: null,
      current_plan: PLAN,
      target_plan: { ...PLAN, plan_code: "business_2999" },
      subscription: null,
      quota_used: 3,
      price_difference: 2000,
      remaining_after_upgrade: 97,
      expires_at_unchanged: true,
      credit_days: 7,
      credit_deadline_at: "2026-01-08T00:00:00.000Z",
      new_purchase_price: null,
    } as unknown as UpgradePreview;

    const v = upgradePreviewViewOf(preview);
    expect(v.canUpgrade).toBe(true);
    expect(v.priceDifference).toBe(2000);
    expect(v.remainingAfterUpgrade).toBe(97);
    expect(v.expiresAtUnchanged).toBe(true);
    expect(v.creditDeadlineAt).toBe("2026-01-08T00:00:00.000Z");
    expect(v.currentPlan?.planCode).toBe("personal_std_999");
    expect(v.targetPlan?.planCode).toBe("business_2999");
    expect(v.subscription).toBeNull();
    const snake = Object.keys(v).filter((k) => /[a-z0-9]_[a-z0-9]/.test(k));
    expect(snake).toEqual([]);
  });
});

describe("tieredComparisonViewOf · 即将上线标记", () => {
  const row = (code: string, tier: string) => ({
    plan_code: code, name_en: code, name_zh: code, positioning_zh: "", price: "1", price_mode: "fixed",
    price_incl_tax: 1, currency: "CNY", billing_period_days: 30, commercial_tier: tier, audience: "personal",
    cta_i18n_key: "", badge: "none", sort_order: 1, is_active: 1, upgrade_credit_days: null,
  });
  const mk = (): ComparisonTable =>
    ({
      plans: [row("personal_m", "L1"), row("business_m", "L3"), row("concierge_m", "L4")],
      rows: [
        {
          benefit: { benefit_code: "product_keyword_lib", name_zh: "产品关键词库", value_kind: "enum", level_dict: null, sort_order: 1 },
          cells: { personal_m: { plan_code: "personal_m", benefit_code: "product_keyword_lib", value_level: 1, value_num: null } },
        },
        {
          benefit: { benefit_code: "evidence_library", name_zh: "企业资料库与能力画像", value_kind: "bool", level_dict: null, sort_order: 2 },
          cells: { business_m: { plan_code: "business_m", benefit_code: "evidence_library", value_level: 1, value_num: null } },
        },
        {
          benefit: { benefit_code: "notice_translation", name_zh: "公告译文", value_kind: "bool", level_dict: null, sort_order: 3 },
          cells: { personal_m: { plan_code: "personal_m", benefit_code: "notice_translation", value_level: 1, value_num: null } },
        },
      ],
    }) as unknown as ComparisonTable;

  it("已实现的 product_keyword_lib 不标「即将上线」；未完善的企业资料模块标记", () => {
    const v = tieredComparisonViewOf(mk());
    const byCode = new Map(v.rows.map((r) => [r.benefit.benefitCode, r.benefit.isComingSoon ?? false]));
    expect(byCode.get("product_keyword_lib")).toBe(false); // 已实现：设置页 + API 均在
    expect(byCode.get("evidence_library")).toBe(true); // 资料库与能力画像：功能未完善（标记仅内部元数据）
    expect(byCode.get("notice_translation")).toBe(false); // 普通权益不带标记
  });
});
