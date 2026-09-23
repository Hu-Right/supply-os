import { describe, it, expect, vi } from "vitest";
import { previewUpgrade } from "@/lib/services/membership-upgrade";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
function fixture(over: { member?: boolean; active?: boolean; missing?: boolean; mode?: string; target?: number; used?: number; quota?: number } = {}) {
  const repo = {
    findActivePlanForUser: vi.fn(async () => over.active === false ? null : { subscription_id: 1, owner_user_id: 7, plan_code: "starter", seat_role: over.member ? "member" : "owner", source_order_no: "SO1" }),
    getPlan: vi.fn(async (code: string) => over.missing ? null : ({ plan_code: code, price: code === "starter" ? "129.00" : String(over.target ?? 999), currency: "CNY", is_active: 1, price_mode: over.mode ?? "fixed" })),
    getCell: vi.fn(async () => ({ raw: over.quota ?? 100 })),
    listQuotaBalances: vi.fn(async () => [{ benefit_code: "notice_view", quota_used: over.used ?? 8, status: "active" }]),
  };
  return repo as unknown as BenefitSystemRepo;
}
describe("新目录升级预览", () => {
  it("差价和剩余取新目录与账本", async () => {
    expect(await previewUpgrade(fixture(), 7, "pro")).toMatchObject({ can_upgrade: true, price_difference: 870, quota_used: 8, remaining_after_upgrade: 92 });
  });
  it("无限额度remaining为null", async () => {
    expect((await previewUpgrade(fixture({ quota: -1 }), 7, "pro")).remaining_after_upgrade).toBeNull();
  });
  it.each([
    [{ active: false }, "NO_ACTIVE_PLAN"], [{ member: true }, "SUBSCRIPTION_OWNER_REQUIRED"],
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
