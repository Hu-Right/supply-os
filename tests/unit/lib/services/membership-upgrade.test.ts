import { describe, it, expect, vi } from "vitest";
import { previewUpgrade, resolveUpgradeCreditWindow } from "@/lib/services/membership-upgrade";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";

const DAY_MS = 24 * 60 * 60 * 1000;

function fixture(over: {
  active?: boolean; missing?: boolean; mode?: string; target?: number; used?: number; quota?: number;
  /** 当前订阅生效至今的天数（抵扣窗口判定依据） */ startedDaysAgo?: number;
  /** 当前档声明的全额抵扣窗口天数；null=文档未承诺抵扣（沿用补差价） */ creditDays?: number | null;
  /** 直接塞入不可解析的 started_at（脏数据保守路径） */ badStarted?: boolean;
} = {}) {
  const creditDays = over.creditDays === undefined ? 7 : over.creditDays;
  const startedAt = over.badStarted ? "not-a-date" : new Date(Date.now() - (over.startedDaysAgo ?? 0) * DAY_MS);
  const repo = {
    findActivePlanForUser: vi.fn(async () => over.active === false ? null : { subscription_id: 1, owner_user_id: 7, plan_code: "starter", source_order_no: "SO1", started_at: startedAt }),
    getPlan: vi.fn(async (code: string) => over.missing ? null : ({
      plan_code: code, price: code === "starter" ? "129.00" : String(over.target ?? 999), currency: "CNY",
      is_active: 1, price_mode: over.mode ?? "fixed",
      upgrade_credit_days: code === "starter" ? creditDays : null,
    })),
    getCell: vi.fn(async () => ({ raw: over.quota ?? 100 })),
    listQuotaBalances: vi.fn(async () => [{ benefit_code: "notice_view", quota_used: over.used ?? 8, status: "active" }]),
  };
  return repo as unknown as BenefitSystemRepo;
}

describe("升级全额抵扣窗口（260928 报价表 129/999 行）", () => {
  it("无窗口承诺 → 不受约束、恒开", () => {
    expect(resolveUpgradeCreditWindow(new Date(), null)).toEqual({ constrained: false, open: true, deadlineAt: null });
  });
  it("窗口内 → 开，并给出截止时间", () => {
    const r = resolveUpgradeCreditWindow(new Date(Date.now() - 3 * DAY_MS), 7);
    expect(r.constrained).toBe(true);
    expect(r.open).toBe(true);
    expect(new Date(r.deadlineAt as string).getTime() - Date.now()).toBeGreaterThan(3 * DAY_MS);
  });
  it("窗口外 → 关", () => expect(resolveUpgradeCreditWindow(new Date(Date.now() - 8 * DAY_MS), 7).open).toBe(false));
  it("字符串时间同样可判（DB 返回 datetime 字符串）", () =>
    expect(resolveUpgradeCreditWindow(new Date(Date.now() - 8 * DAY_MS).toISOString(), 7).open).toBe(false));
  it("时间不可解析 + 有窗口承诺 → 保守判为窗口外（不白送抵扣）", () =>
    expect(resolveUpgradeCreditWindow("garbage", 7)).toEqual({ constrained: true, open: false, deadlineAt: null }));
});

describe("新目录升级预览", () => {
  it("差价和剩余取新目录与账本", async () => {
    expect(await previewUpgrade(fixture(), 7, "pro")).toMatchObject({ can_upgrade: true, price_difference: 870, quota_used: 8, remaining_after_upgrade: 92 });
  });
  it("无限额度remaining为null", async () => {
    expect((await previewUpgrade(fixture({ quota: -1 }), 7, "pro")).remaining_after_upgrade).toBeNull();
  });
  it("窗口内带出抵扣天数与截止时间", async () => {
    const p = await previewUpgrade(fixture({ startedDaysAgo: 2 }), 7, "pro");
    expect(p.can_upgrade).toBe(true);
    expect(p.credit_days).toBe(7);
    expect(p.new_purchase_price).toBeNull();
    expect(p.credit_deadline_at).toBeTruthy();
  });
  it("超窗口不给抵扣升级路径：原价新购 + 明确原因", async () => {
    const p = await previewUpgrade(fixture({ startedDaysAgo: 8 }), 7, "pro");
    expect(p).toMatchObject({ can_upgrade: false, reason: "UPGRADE_CREDIT_WINDOW_CLOSED", price_difference: 999, new_purchase_price: 999, credit_days: 7 });
  });
  it("档位未承诺抵扣（creditDays=null）时不因时间收紧：第 300 天仍补差价", async () => {
    expect(await previewUpgrade(fixture({ startedDaysAgo: 300, creditDays: null }), 7, "pro"))
      .toMatchObject({ can_upgrade: true, price_difference: 870, credit_days: null, credit_deadline_at: null });
  });
  it("started_at 脏数据 + 有窗口承诺 → 走原价新购", async () => {
    expect(await previewUpgrade(fixture({ badStarted: true }), 7, "pro"))
      .toMatchObject({ can_upgrade: false, reason: "UPGRADE_CREDIT_WINDOW_CLOSED", price_difference: 999 });
  });
  it.each([
    [{ active: false }, "NO_ACTIVE_PLAN"],
    [{ missing: true }, "TARGET_PLAN_NOT_FOUND"], [{ mode: "contact" }, "TARGET_PLAN_NOT_UPGRADABLE"],
    [{ mode: "free" }, "TARGET_PLAN_NOT_UPGRADABLE"], [{ target: 100 }, "CANNOT_DOWNGRADE"],
    [{ used: 101 }, "UPGRADE_QUOTA_INVALID"],
  ] as const)("拒绝条件%o", async (over, reason) => {
    expect(await previewUpgrade(fixture(over), 7, "pro")).toMatchObject({ can_upgrade: false, reason });
  });
  it("同档不重复升级", async () => {
    expect((await previewUpgrade(fixture(), 7, "starter")).reason).toBe("ALREADY_ON_TARGET_PLAN");
  });
  it("查询异常直接抛出", async () => {
    const r = fixture(); vi.mocked(r.getPlan).mockRejectedValueOnce(new Error("DB_DOWN"));
    await expect(previewUpgrade(r, 7, "pro")).rejects.toThrow("DB_DOWN");
  });
});
