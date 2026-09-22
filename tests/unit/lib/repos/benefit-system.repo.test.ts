/**
 * BenefitSystemRepo 读层单测
 *
 * 关注三件事：
 * 1. 取值解析必须与库内注释口径逐字一致（-1=不限、0=明确无额度、枚举行显示 docx 原文、布尔行 ✓/—）；
 * 2. 缺格不得被猜成默认值——必须显式暴露；
 * 3. 读层不得引用任何旧表（防"兼容/映射层"回流）。
 */
import { describe, it, expect, vi } from "vitest";
import { resolveCell, BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";

/** 伪造 pool：按注册表返回行集，并记录全部 SQL 供形状断言 */
function makePool(responder: (sql: string) => unknown[]) {
  const calls: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string) => {
      calls.push(String(sql).replace(/\s+/g, " ").trim());
      return [responder(String(sql)) ?? [], []];
    }),
  };
  // as unknown as ConstructorParameters<typeof BenefitSystemRepo>[0] 是最小 fake 的必然代价
  return { repo: new BenefitSystemRepo(pool as never), calls };
}

const ENUM_DEF = {
  benefit_code: "alert_service",
  value_kind: "enum" as const,
  level_dict: { "0": "—", "1": "基础", "2": "✓", "3": "Webhook/API" },
};
const cell = (over: Partial<Record<string, unknown>>) => ({
  plan_code: "advisor",
  benefit_code: "alert_service",
  value_level: null,
  value_num: null,
  value_amount: null,
  note_zh: null,
  ...over,
}) as never;

describe("resolveCell · 四种 value_kind 的取值与展示", () => {
  it("enum：display 取 level_dict 里的 docx 原文，level 0 视为不享有", () => {
    expect(resolveCell(ENUM_DEF, cell({ value_level: 3 }))).toMatchObject({
      enabled: true,
      display: "Webhook/API",
      raw: 3,
    });
    expect(resolveCell(ENUM_DEF, cell({ value_level: 0 }))).toMatchObject({
      enabled: false,
      display: "—",
    });
  });

  it("bool：1→✓、0→—，不依赖 level_dict", () => {
    const def = { benefit_code: "dedicated_advisor", value_kind: "bool" as const, level_dict: null };
    expect(resolveCell(def, cell({ value_level: 1 }))).toMatchObject({ enabled: true, display: "✓" });
    expect(resolveCell(def, cell({ value_level: 0 }))).toMatchObject({ enabled: false, display: "—" });
  });

  it("quota：-1=不限、0=明确无额度（而非未配置）、正数=条数", () => {
    const def = { benefit_code: "notice_view", value_kind: "quota" as const, level_dict: null };
    expect(resolveCell(def, cell({ value_num: -1 }))).toMatchObject({ enabled: true, display: "不限" });
    expect(resolveCell(def, cell({ value_num: 0 }))).toMatchObject({ enabled: false, display: "—" });
    expect(resolveCell(def, cell({ value_num: 100 }))).toMatchObject({ enabled: true, display: "100" });
  });

  it("amount：0.00=包含、正数=会员价，两者都算享有", () => {
    const def = { benefit_code: "ai_tender_analysis_price", value_kind: "amount" as const, level_dict: null };
    expect(resolveCell(def, cell({ value_amount: "0.00" }))).toMatchObject({ enabled: true, display: "包含" });
    expect(resolveCell(def, cell({ value_amount: "199.00" }))).toMatchObject({ enabled: true, display: "¥199.00" });
  });

  it("note_zh 原样带出（边界说明是格级数据，不是注释）", () => {
    const r = resolveCell(ENUM_DEF, cell({ value_level: 1, note_zh: "批量下载按增值服务计费" }));
    expect(r.note).toBe("批量下载按增值服务计费");
  });
});

describe("buildComparisonTable · 完整性", () => {
  it("矩阵缺格显示 ∅ 且判为不享有，不静默补 0", async () => {
    const plans = [{ plan_code: "pro", price_mode: "fixed", sort_order: 2 }] as never;
    const defs = [ENUM_DEF] as never;
    const { repo } = makePool((sql) => {
      if (sql.includes("crm_plan_catalog")) return plans;
      if (sql.includes("crm_benefit_catalog")) return defs;
      return []; // 矩阵一行都没有 → 全缺格
    });
    const table = await repo.buildComparisonTable();
    expect(table.rows[0].cells.pro).toMatchObject({ display: "∅", enabled: false });
    expect(table.rows[0].cells.pro.note).toContain("矩阵缺格");
  });

  it("free 行默认排除（不售卖档不进官网对比表），includeFree 可取回", async () => {
    const plans = [
      { plan_code: "free", price_mode: "free", sort_order: 0 },
      { plan_code: "pro", price_mode: "fixed", sort_order: 2 },
    ] as never;
    const { repo } = makePool((sql) => {
      if (sql.includes("crm_plan_catalog")) return plans;
      if (sql.includes("crm_benefit_catalog")) return [ENUM_DEF];
      return [cell({ plan_code: "pro", value_level: 2 }), cell({ plan_code: "free", value_level: 0 })];
    });
    expect((await repo.buildComparisonTable()).plans.map((p) => p.plan_code)).toEqual(["pro"]);
    const withFree = await repo.buildComparisonTable(true);
    expect(withFree.plans.map((p) => p.plan_code)).toEqual(["free", "pro"]);
    expect(withFree.rows[0].cells.free).toMatchObject({ enabled: false, display: "—" });
  });
});

describe("findActivePlanForUser · 订阅与席位同链", () => {
  it("SQL 只引用新表组，且 owner/席位成员两条来源都覆盖", async () => {
    const { repo, calls } = makePool(() => []);
    await repo.findActivePlanForUser(42);
    const sql = calls[0];
    for (const t of ["crm_plan_subscriptions", "crm_subscription_seats", "crm_plan_catalog"]) {
      expect(sql).toContain(t);
    }
    // 兼容/映射层回流的守门断言：读层一旦出现旧表名即为违约
    for (const legacy of ["crm_membership_plans", "crm_user_subscriptions", "crm_user_entitlements"]) {
      expect(sql).not.toContain(legacy);
    }
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("st.is_owner = 0");
    expect(sql).toMatch(/expires_at IS NULL OR s\.expires_at > NOW\(\)/);
  });

  it("额度池按 NULL 安全比较查普通用户池，并只留每权益当前周期一行", async () => {
    const { repo, calls } = makePool(() => [
      { benefit_code: "notice_view", scope: "subscription", quota_total: -1, quota_used: 0, period: "yearly", period_starts_at: new Date(2) },
      { benefit_code: "notice_view", scope: "subscription", quota_total: 10, quota_used: 3, period: "yearly", period_starts_at: new Date(1) },
      { benefit_code: "tech_support", scope: "subscription", quota_total: 12, quota_used: 5, period: "none", period_starts_at: new Date(3) },
    ]);
    const rows = await repo.listQuotaBalances(42, null);
    expect(calls[0]).toContain("subscription_id <=> ?");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ benefit_code: "notice_view", quota_total: -1, remaining: null });
    expect(rows[1]).toMatchObject({ benefit_code: "tech_support", quota_used: 5, remaining: 7 });
  });
});

describe("isEntitled · 门控唯一入口", () => {
  it("未登录只可能命中 requires_subscription=0 的权益", async () => {
    const { repo, calls } = makePool(() => [
      { benefit_code: "global_search", requires_subscription: 0, value_kind: "bool", level_dict: null },
    ]);
    expect(await repo.isEntitled(null, "global_search")).toBe(true);
    expect(calls.some((s) => s.includes("crm_plan_subscriptions"))).toBe(false);
  });

  it("requires_subscription=1 且无生效订阅 → 不享有（不再回退到旧 tier 判定）", async () => {
    const { repo } = makePool((sql) => {
      if (sql.includes("crm_benefit_catalog")) {
        return [{ benefit_code: "notice_view", requires_subscription: 1, value_kind: "quota", level_dict: null }];
      }
      return []; // 无生效订阅
    });
    expect(await repo.isEntitled(42, "notice_view")).toBe(false);
  });

  it("有生效订阅时按矩阵格取值，0 额度格判为不享有", async () => {
    const { repo } = makePool((sql) => {
      if (sql.includes("crm_benefit_catalog")) {
        return [{ benefit_code: "notice_view", requires_subscription: 1, value_kind: "quota", level_dict: null }];
      }
      if (sql.includes("crm_plan_subscriptions")) return [{ plan_code: "starter", subscription_id: 9 }];
      return [{ plan_code: "starter", benefit_code: "notice_view", value_num: 0 }];
    });
    expect(await repo.isEntitled(42, "notice_view")).toBe(false);
  });
});
