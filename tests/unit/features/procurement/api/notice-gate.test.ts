/**
 * 公告权益门控错误归一测试（V2 档位闸门 vs 解锁闸门）
 * 偏差 #1/#3 回归防护：档位不足的 403 不得被误映射为“请先解锁”。
 */
import { describe, it, expect } from "vitest";
import { ApiError } from "@/core/http";
import { EC_VIP_ONLY } from "@/shared/constants/api";
import { gateErrorToken, vipGateMessage, rankToTierName, VIP_PREFIX } from "@/features/procurement/api/notice-gate";

describe("gateErrorToken", () => {
  it("VIP 档位闸门（EC_VIP_ONLY + required_rank）→ 编码为 VIP_ONLY|rank", () => {
    const err = new ApiError(403, "AI 适配评分为专业版权益", EC_VIP_ONLY, { feature: "ai_score", required_rank: 3 });
    expect(gateErrorToken(err)).toBe(`${VIP_PREFIX}|3`);
  });

  it("VIP 但缺 required_rank → rank 归 0（不崩）", () => {
    const err = new ApiError(403, "VIP", EC_VIP_ONLY, {});
    expect(gateErrorToken(err)).toBe(`${VIP_PREFIX}|0`);
  });

  it("未解锁（40013）→ 保留状态数字，令既有 403/解锁分支仍命中", () => {
    const err = new ApiError(403, "公告已锁定，请先解锁", 40013, { core_locked: true });
    const tok = gateErrorToken(err);
    expect(tok).toContain("403");
    expect(tok).toContain("解锁");
    expect(vipGateMessage(tok)).toBeNull();
  });

  it("非 ApiError → 透传 message", () => {
    expect(gateErrorToken(new Error("boom"))).toBe("boom");
    expect(gateErrorToken("str")).toBe("str");
  });
});

describe("vipGateMessage", () => {
  it("VIP token → 按档位给出“升级X版”文案（不再出现“解锁”误导）", () => {
    const msg = vipGateMessage(`${VIP_PREFIX}|3`)!;
    expect(msg).toContain("专业版");
    expect(msg).not.toContain("解锁");
  });
  it("非 VIP token → null", () => {
    expect(vipGateMessage("403 公告已锁定")).toBeNull();
  });
});

describe("rankToTierName", () => {
  it("1..4 映射四档名，未知归更高", () => {
    expect(rankToTierName(1)).toBe("个人体验版");
    expect(rankToTierName(2)).toBe("个人标准版");
    expect(rankToTierName(3)).toBe("个人专业版");
    expect(rankToTierName(4)).toBe("企业年度会员");
    expect(rankToTierName(0)).toBe("更高会员等级");
    expect(rankToTierName(99)).toBe("更高会员等级");
  });
});
