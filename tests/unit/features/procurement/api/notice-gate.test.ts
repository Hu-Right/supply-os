/**
 * 公告权益门控分类测试（V2 档位闸门 vs 解锁闸门）——迁移至统一层 @/core/http
 * 偏差 #1/#3 回归防护：档位不足的 403 不得被误映射为“请先解锁”，反之亦然。
 */
import { describe, it, expect } from "vitest";
import { ApiError, classifyApiError, resolveErrorText } from "@/core/http";
import { EC_VIP_ONLY, EC_CONTENT_LOCKED } from "@/shared/constants/api";
import { rankToTierKey } from "@/features/procurement/api/notice-gate";

describe("classifyApiError 权益门控（统一层）", () => {
  it("VIP 档位闸门（EC_VIP_ONLY + required_rank）→ kind=vipGate + rank", () => {
    const err = new ApiError(403, "AI 适配评分为专业版权益", EC_VIP_ONLY, { feature: "ai_score", required_rank: 3 });
    const c = classifyApiError(err);
    expect(c.kind).toBe("vipGate");
    expect(c.key).toBe("errVipFeatureOnly");
    expect(c.requiredRank).toBe(3);
  });

  it("VIP 但缺 required_rank → undefined（不崩）", () => {
    const err = new ApiError(403, "VIP", EC_VIP_ONLY, {});
    expect(classifyApiError(err).requiredRank).toBeUndefined();
  });

  it("未解锁（EC_CONTENT_LOCKED + coreLocked）→ 不误判为 vipGate，映射解锁键", () => {
    const err = new ApiError(403, "公告已锁定，请先解锁", EC_CONTENT_LOCKED, { coreLocked: true });
    const c = classifyApiError(err);
    expect(c.kind).not.toBe("vipGate");
    expect(c.key).toBe("errUnlockRequired");
  });

  it("锁定 detail 优先于撞码（旧 40013=EC_ACCOUNT_ISSUE + coreLocked）→ 仍解锁键（step0 兜底）", () => {
    const err = new ApiError(403, "公告已锁定，请先解锁", 40013, { coreLocked: true });
    const c = classifyApiError(err);
    expect(c.kind).toBe("forbidden");
    expect(c.key).toBe("errUnlockRequired");
  });

  it("rankToTierKey：1..4 映射六语 tier 键，未知归 tierHigher", () => {
    expect(rankToTierKey(1)).toBe("tierTrial");
    expect(rankToTierKey(2)).toBe("tierStd");
    expect(rankToTierKey(3)).toBe("tierPro");
    expect(rankToTierKey(4)).toBe("tierEnterprise");
    expect(rankToTierKey(99)).toBe("tierHigher");
  });

  it("resolveErrorText：无 t 命中键时回落人类可读 message", () => {
    const c = classifyApiError(new Error("自定义中文错误，请勿外泄"));
    // 未登记键 + 含 CJK → 直接展示原 message
    expect(resolveErrorText(c, () => "")).toBe("自定义中文错误，请勿外泄");
  });
});
