/**
 * 内容类接口统一访问闸口（assertNoticeContentAccess）单测
 *
 * 钉住 2026-11-18 收口口径：行业墙（canAccessNotice）→ 解锁/套餐（resolveNoticeAccess）
 * → 内容权益（benefit），顺序与 /detail 一致；任何返回公告内容的接口都必须先过这里，
 * 防止只抄「解锁」漏抄「行业墙」导致行业限定档被旁路。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { canAccessNoticeMock } = vi.hoisted(() => ({ canAccessNoticeMock: vi.fn() }));
vi.mock("@/lib/services/industry-scope", () => ({ canAccessNotice: canAccessNoticeMock }));

import { assertNoticeContentAccess } from "@/lib/services/notice-access";
import { EC_CONTENT_LOCKED, EC_OUT_OF_CATEGORY, EC_VIP_ONLY } from "@/shared/constants/api";

interface DepsOptions {
  wall?: boolean;
  unlock?: Record<string, unknown> | null;
  planCode?: "free" | "enterprise";
  noticeViewEntitled?: boolean;
  benefitEntitled?: boolean;
}

function makeDeps(options: DepsOptions = {}) {
  const { wall = true, unlock = null, planCode = "enterprise", noticeViewEntitled = true, benefitEntitled = true } = options;
  canAccessNoticeMock.mockResolvedValue(wall);
  const accessGrantRepo = { findGrant: vi.fn().mockResolvedValue(unlock) };
  const benefitRepo = {
    findActivePlanForUser: vi.fn().mockResolvedValue({ plan_code: planCode }),
    isEntitled: vi.fn().mockImplementation(async (_userId: number, code: string) => {
      if (code === "notice_view") return noticeViewEntitled;
      return benefitEntitled;
    }),
  };
  return {
    dbPool: {} as never,
    benefitRepo: benefitRepo as never,
    accessGrantRepo: accessGrantRepo as never,
    userId: 7,
    noticeId: 42,
    // 便于断言
    raw: { accessGrantRepo, benefitRepo },
  };
}

describe("assertNoticeContentAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("行业墙越界 → 403 outOfCategory，且不再查解锁（顺序：先墙后锁）", async () => {
    const deps = makeDeps({ wall: false });
    await expect(assertNoticeContentAccess(deps)).rejects.toMatchObject({
      status: 403,
      code: EC_OUT_OF_CATEGORY,
      extra: { outOfCategory: true },
    });
    expect(canAccessNoticeMock).toHaveBeenCalledWith(deps.dbPool, deps.benefitRepo, 7, 42);
    expect(deps.raw.accessGrantRepo.findGrant).not.toHaveBeenCalled();
  });

  it("墙内、免费档且无单条解锁 → 403 coreLocked", async () => {
    const deps = makeDeps({ wall: true, planCode: "free", noticeViewEntitled: false });
    await expect(assertNoticeContentAccess(deps)).rejects.toMatchObject({
      status: 403,
      code: EC_CONTENT_LOCKED,
      extra: { coreLocked: true },
    });
  });

  it("墙内、有单条解锁 → 放行（不查套餐权益）", async () => {
    const deps = makeDeps({ wall: true, unlock: { id: 1 } });
    await expect(assertNoticeContentAccess(deps)).resolves.toBeUndefined();
    expect(deps.raw.benefitRepo.findActivePlanForUser).not.toHaveBeenCalled();
  });

  it("墙内、套餐含 notice_view（非免费档）→ 放行，无需单条解锁", async () => {
    const deps = makeDeps({ wall: true, planCode: "enterprise", noticeViewEntitled: true });
    await expect(assertNoticeContentAccess(deps)).resolves.toBeUndefined();
  });

  it("内容权益缺失 → 403 feature（如译文/AI 匹配档位不够）", async () => {
    const deps = makeDeps({ wall: true, unlock: { id: 1 }, benefitEntitled: false });
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
    const deps = makeDeps({ wall: true, unlock: { id: 1 }, benefitEntitled: true });
    await expect(
      assertNoticeContentAccess({ ...deps, benefit: "notice_translation" }),
    ).resolves.toBeUndefined();
  });
});
