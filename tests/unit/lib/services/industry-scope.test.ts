/**
 * 行业可见性墙 — 范围判定单测（2026-09-29「8,800元/行业」口径固化）
 *
 * 钉住判定链的六个出口：匿名不墙 / 无订阅不墙 / 演示档旁路（all_category_access）/
 * 非限定档不墙（industry_scoped=0）/ 限定档+已绑行业 → 墙 / 限定档+未绑行业 → 暂不墙+引导。
 * 类目命中检查独立覆盖：命中放行、有码不命中拦截、无码放行，
 * 以及 2026-10-10 修的编号口径铁则（内部 id 必须经主表 JOIN 中转）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const profile = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/services/industry-profile/resolve", () => ({
  resolveUserIndustryProfile: profile.resolve,
  invalidateProfileCache: vi.fn(),
}));

import { resolveIndustryScope, canAccessNotice, noticeInCategory } from "@/lib/services/industry-scope";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { Pool, RowDataPacket } from "mysql2/promise";

function makeCatalog(opts: { plan?: { plan_code: string } | null; scoped?: boolean; bypass?: boolean } = {}) {
  return {
    findActivePlanForUser: vi.fn(async () => (opts.plan === undefined ? { plan_code: "business" } : opts.plan)),
    isEntitled: vi.fn(async (_uid: number, code: string) =>
      code === "all_category_access" ? !!opts.bypass : code === "industry_scoped" ? !!opts.scoped : false),
  } as unknown as BenefitSystemRepo;
}

const pool = { query: vi.fn() } as unknown as Pool;

beforeEach(() => {
  profile.resolve.mockReset();
  (pool.query as ReturnType<typeof vi.fn>).mockReset();
});

describe("resolveIndustryScope · 判定链", () => {
  it("匿名不墙（转化漏斗口径）", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog(), null)).toEqual({ scoped: false, level1Id: null, needsIndustry: false });
  });

  it("无生效订阅（普通用户）不墙", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog({ plan: null }), 7)).toMatchObject({ scoped: false });
  });

  it("全类目旁路（internal_demo 演示档）不墙，且不再查行业限定", async () => {
    const catalog = makeCatalog({ bypass: true, scoped: false });
    const r = await resolveIndustryScope(pool, catalog, 42);
    expect(r).toMatchObject({ scoped: false });
    expect(catalog.isEntitled).toHaveBeenCalledWith(42, "all_category_access");
    expect(catalog.isEntitled).not.toHaveBeenCalledWith(42, "industry_scoped");
  });

  it("非限定档（industry_scoped=0，个人三档）不墙", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: false }), 7)).toMatchObject({ scoped: false });
  });

  it("限定档 + 已绑一级类目 → 墙启动并带出 level1Id", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, levelIds: [101, 100901, null, null, null], deepestLevel: 2, deepestId: 100901 });
    const r = await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 42);
    expect(r).toEqual({ scoped: true, level1Id: 101, needsIndustry: false });
  });

  it("限定档但未绑行业 → 暂不墙 + needsIndustry 引导", async () => {
    profile.resolve.mockResolvedValue(null);
    const r = await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 42);
    expect(r).toEqual({ scoped: false, level1Id: null, needsIndustry: true });
  });
});

describe("canAccessNotice · 类目命中检查", () => {
  it("未被墙一律放行", async () => {
    expect(await canAccessNotice(pool, makeCatalog({ scoped: false }), 42, 9001)).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("命中放行、有码不命中拦截", async () => {
    profile.resolve.mockResolvedValue({ levelIds: [101] });
    const catalog = makeCatalog({ scoped: true });
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[{ rows_total: 3, hit_rows: 2 }] as RowDataPacket[], []]);
    expect(await canAccessNotice(pool, catalog, 42, 9001)).toBe(true);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[{ rows_total: 3, hit_rows: 0 }] as RowDataPacket[], []]);
    expect(await canAccessNotice(pool, catalog, 42, 9002)).toBe(false);
  });

  it("公告本身无码（无类目数据）→ 放行，不被脏数据锁死", async () => {
    profile.resolve.mockResolvedValue({ levelIds: [101] });
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[{ rows_total: 0, hit_rows: null }] as RowDataPacket[], []]);
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9003)).toBe(true);
  });

  it("口径铁则：内部 id 只能匹配主表 n.id，不得直接匹配桥表外部 notice_id", async () => {
    profile.resolve.mockResolvedValue({ levelIds: [101] });
    const query = pool.query as ReturnType<typeof vi.fn>;
    query.mockResolvedValue([[{ rows_total: 1, hit_rows: 1 }] as RowDataPacket[], []]);
    await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9004);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("JOIN crm_bid_notices n ON n.notice_id = b.notice_id");
    expect(sql).toContain("WHERE n.id = ?");
    expect(sql).not.toMatch(/WHERE notice_id = \?/);
    // 参数顺序：level1Id 在 SELECT 的 SUM 里，noticeDbId 在 WHERE 里
    expect(query.mock.calls[0][1]).toEqual([101, 9004]);
  });
});

describe("noticeInCategory · 搜索参考号快速路径口径", () => {
  it("命中 → true；有码不命中与无码均 → false（落回主管道由强制 level1 过滤自然滤掉）", async () => {
    const query = pool.query as ReturnType<typeof vi.fn>;
    query.mockResolvedValue([[{ rows_total: 2, hit_rows: 1 }] as RowDataPacket[], []]);
    expect(await noticeInCategory(pool, 9005, 101)).toBe(true);
    query.mockResolvedValue([[{ rows_total: 2, hit_rows: 0 }] as RowDataPacket[], []]);
    expect(await noticeInCategory(pool, 9005, 101)).toBe(false);
    query.mockResolvedValue([[{ rows_total: 0, hit_rows: null }] as RowDataPacket[], []]);
    expect(await noticeInCategory(pool, 9005, 101)).toBe(false);
  });
});
