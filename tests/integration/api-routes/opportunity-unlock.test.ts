/**
 * POST /api/opportunities/[id]/unlock 集成测试
 *
 * @description 覆盖商机解锁路由 + executeOpportunityUnlock 编排的胶水层：
 *              - 404：商机不存在
 *              - 402：free 硬闸（免费试用已移除）
 *              - 402：配额耗尽（矩阵缺格 / 池已耗尽）
 *              - 201：成功路径的事务写入（解锁流水 INSERT）
 *              - 200：无锁预检幂等（alreadyUnlocked）
 *              - 403：行业墙（越类目拒绝，无写入）
 *              Mock repo/配额依赖/行业墙，验证路由参数解析、错误码映射与编排调用。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// 类型化 mock 防护：resolveIndustryScope 的返回值必须满足真实 IndustryScope，
// 使生产侧字段改名（如 G 码退役 groupCode→l1Code）时 tsc 直接报错，而非静默旧形。
import type { IndustryScope } from "@/lib/services/industry-scope";
// 同理钉住配额侧跨仓边界：锁行与消耗结果必须满足 benefit-write 导出的真实类型。
import type { LockedPoolRow, ConsumeResult } from "@/lib/repos/benefit-write.repo";

const {
  findExistingUnlock,
  findById,
  connQuery,
  loadCells,
  consumeLockedPool,
  resolveIndustryScope,
  opportunityInCategory,
} = vi.hoisted(() => ({
  findExistingUnlock: vi.fn(),
  findById: vi.fn(),
  connQuery: vi.fn(),
  loadCells: vi.fn(),
  consumeLockedPool: vi.fn(),
  resolveIndustryScope: vi.fn(),
  opportunityInCategory: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 6, authViaJwt: true }),
  requireUserKey: vi.fn().mockResolvedValue({ userId: 6, authViaJwt: true }),
  extractUserKey: vi.fn().mockResolvedValue({ userId: 6, authViaJwt: true }),
}));

vi.mock("@/lib/middleware/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/services/industry-scope", () => ({
  resolveIndustryScope,
  opportunityInCategory,
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    dbPool: {
      getConnection: vi.fn().mockResolvedValue({
        beginTransaction: vi.fn(async () => {}),
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
        release: vi.fn(async () => {}),
        query: connQuery,
        execute: connQuery,
      }),
    },
    opportunitiesRepo: {
      findById,
      findExistingUnlock,
    },
    benefitSystemRepo: {
      findActivePlanForUser: vi.fn().mockResolvedValue({
        subscription_id: 77,
        owner_user_id: 6,
        plan_code: "annual_test",
      }),
      loadCells,
    },
    benefitWriteRepo: {
      findAndLockCurrentPool: vi.fn().mockResolvedValue({
        id: 12,
        subscription_id: 77,
        user_id: 6,
        benefit_code: "notice_view",
        quota_total: 100,
        quota_used: 5,
        status: "active",
      } satisfies LockedPoolRow),
      openQuotaPool: vi.fn().mockResolvedValue(undefined),
      consumeLockedPool,
    },
  }),
}));

function unlockRequest(id: number, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/opportunities/${id}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockResolvedValue({ id: 176 });
  findExistingUnlock.mockResolvedValue(null);
  connQuery.mockResolvedValue([[]]);
  loadCells.mockResolvedValue([{ benefit_code: "notice_view", value_num: 100 }]);
  consumeLockedPool.mockResolvedValue("consumed" satisfies ConsumeResult);
  resolveIndustryScope.mockResolvedValue({ scoped: false, l1Code: null, l1Nodes: [], needsIndustry: false } satisfies IndustryScope);
  opportunityInCategory.mockResolvedValue(true);
});

describe("POST /api/opportunities/[id]/unlock", () => {
  it("商机不存在 → 404 + 不存在文案", async () => {
    findById.mockResolvedValue(null);
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(999999999, { unlock_type: "subscription" }), routeParams(999999999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toContain("不存在");
  });

  it("free 类型 → 402 免费硬闸（免费试用已移除，不落任何流水）", async () => {
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "free" }), routeParams(176));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toContain("免费");
    // 事务内只允许幂等复查的 SELECT，不得出现解锁流水的 INSERT
    const insertCalled = connQuery.mock.calls.some(([sql]: string[]) =>
      String(sql).includes("INSERT INTO crm_opportunity_unlocks"));
    expect(insertCalled).toBe(false);
  });

  it("缺少 unlock_type 默认 free → 402（客户端空 body 的服务端兜底口径）", async () => {
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, {}), routeParams(176));
    expect(res.status).toBe(402);
  });

  it("成功解锁 → 201，事务内写入解锁流水（单价快照恒 0）", async () => {
    connQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT id FROM crm_opportunity_unlocks")) return [[]];
      if (String(sql).includes("INSERT INTO crm_opportunity_unlocks")) return [{ insertId: 1 }];
      return [{ affectedRows: 1 }];
    });
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "subscription" }), routeParams(176));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.unlockType).toBe("subscription");

    const insertCall = connQuery.mock.calls.find(([sql]: string[]) =>
      String(sql).includes("INSERT INTO crm_opportunity_unlocks"));
    expect(insertCall).toBeTruthy();
    // 解锁流水参数：user_id, opportunity_id, unlock_type, price
    expect(insertCall![1]).toEqual([6, 176, "subscription", 0]);
  });

  it("已解锁过 → 200 alreadyUnlocked（无锁预检，不重复写流水）", async () => {
    findExistingUnlock.mockResolvedValue({ id: 1, unlock_type: "subscription" });
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "subscription" }), routeParams(176));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyUnlocked).toBe(true);
    expect(connQuery).not.toHaveBeenCalled();
  });

  it("矩阵缺 notice_view 格 → 402 引导开通会员（矩阵没写=没有，不猜默认额度）", async () => {
    loadCells.mockResolvedValue([{ benefit_code: "other_benefit", value_num: 50 }]);
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "subscription" }), routeParams(176));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toContain("会员");
  });

  it("额度格为 0 → 402（零额度档位不解锁）", async () => {
    loadCells.mockResolvedValue([{ benefit_code: "notice_view", value_num: 0 }]);
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "subscription" }), routeParams(176));
    expect(res.status).toBe(402);
  });

  it("池被并发耗尽（consumed→denied）→ 402，事务回滚不落流水", async () => {
    loadCells.mockResolvedValue([{ benefit_code: "notice_view", value_num: 100 }]);
    consumeLockedPool.mockResolvedValue("denied" satisfies ConsumeResult);
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "single" }), routeParams(176));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toContain("会员");
  });

  it("行业墙：越大类 → 403，不解锁不扣配额", async () => {
    resolveIndustryScope.mockResolvedValue({ scoped: true, l1Code: "UGT-25", l1Nodes: ["UGT-25"], needsIndustry: false } satisfies IndustryScope);
    opportunityInCategory.mockResolvedValue(false);
    const { POST } = await import("@/app/api/opportunities/[id]/unlock/route");
    const res = await POST(unlockRequest(176, { unlock_type: "subscription" }), routeParams(176));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.out_of_category).toBe(true);
    // 商机侧判定输入是大类码（那张表没有 backbone_path）
    expect(opportunityInCategory).toHaveBeenCalledWith(expect.anything(), 176, "UGT-25");
    expect(connQuery).not.toHaveBeenCalled();
  });
});
