/**
 * 内容类接口统一访问闸口（assertNoticeContentAccess）单测
 *
 * 钉住现行口径（2026-11-27 次数体系下线后）：行业墙（canAccessNotice）→ 套餐
 * （resolveNoticeAccess，notice_view 权益格放行）→ 内容权益（benefit），
 * 顺序与 /detail 一致；任何返回公告内容的接口都必须先过这里，
 * 防止只抄「套餐」漏抄「行业墙」导致行业限定档被旁路。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { canAccessNoticeMock } = vi.hoisted(() => ({ canAccessNoticeMock: vi.fn() }));
vi.mock("@/lib/services/industry-scope", () => ({ canAccessNotice: canAccessNoticeMock }));

import { assertNoticeContentAccess } from "@/lib/services/notice-access";
import { EC_CONTENT_LOCKED, EC_OUT_OF_CATEGORY, EC_VIP_ONLY } from "@/shared/constants/api";

interface DepsOptions {
  wall?: boolean;
  planCode?: "free" | "enterprise";
  noticeViewEntitled?: boolean;
  benefitEntitled?: boolean;
}

function makeDeps(options: DepsOptions = {}) {
  const { wall = true, planCode = "enterprise", noticeViewEntitled = true, benefitEntitled = true } = options;
  canAccessNoticeMock.mockResolvedValue(wall);
  const benefitRepo = {
    findActivePlanForUser: vi.fn().mockResolvedValue(planCode === "free" ? null : { plan_code: planCode }),
    isEntitled: vi.fn().mockImplementation(async (_userId: number, code: string) => {
      if (code === "notice_view") return noticeViewEntitled;
      return benefitEntitled;
    }),
  };
  return {
    dbPool: {} as never,
    benefitRepo: benefitRepo as never,
    userId: 7,
    noticeId: 42,
    // 便于断言
    raw: { benefitRepo },
  };
}

describe("assertNoticeContentAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("行业墙越界 → 403 outOfCategory，且不再查套餐（顺序：先墙后锁）", async () => {
    const deps = makeDeps({ wall: false });
    await expect(assertNoticeContentAccess(deps)).rejects.toMatchObject({
      status: 403,
      code: EC_OUT_OF_CATEGORY,
      extra: { outOfCategory: true },
    });
    expect(canAccessNoticeMock).toHaveBeenCalledWith(deps.dbPool, deps.benefitRepo, 7, 42);
    expect(deps.raw.benefitRepo.findActivePlanForUser).not.toHaveBeenCalled();
  });

  it("墙内、免费档（无生效套餐）→ 403 coreLocked", async () => {
    const deps = makeDeps({ wall: true, planCode: "free", noticeViewEntitled: false });
    await expect(assertNoticeContentAccess(deps)).rejects.toMatchObject({
      status: 403,
      code: EC_CONTENT_LOCKED,
      extra: { coreLocked: true },
    });
  });

  it("墙内、套餐含 notice_view（非免费档）→ 放行", async () => {
    const deps = makeDeps({ wall: true, planCode: "enterprise", noticeViewEntitled: true });
    await expect(assertNoticeContentAccess(deps)).resolves.toBeUndefined();
  });

  it("墙内、付费档但矩阵未放行 notice_view → 403 coreLocked", async () => {
    const deps = makeDeps({ wall: true, planCode: "enterprise", noticeViewEntitled: false });
    await expect(assertNoticeContentAccess(deps)).rejects.toMatchObject({
      status: 403,
      code: EC_CONTENT_LOCKED,
      extra: { coreLocked: true },
    });
  });

  it("内容权益缺失 → 403 feature（如译文/AI 匹配档位不够）", async () => {
    const deps = makeDeps({ wall: true, benefitEntitled: false });
    await expect(
      assertNoticeContentAccess({ ...deps, benefit: "notice_translation", benefitMessage: "当前套餐不包含译文" }),
    ).rejects.toMatchObject({
      status: 403,
      code: EC_VIP_ONLY,
      message: "当前套餐不包含译文",
      extra: { feature: "notice_translation" },
    });
  });

  it("权益存在 → 放行", async () => {
    const deps = makeDeps({ wall: true, benefitEntitled: true });
    await expect(
      assertNoticeContentAccess({ ...deps, benefit: "notice_translation" }),
    ).resolves.toBeUndefined();
  });
});
