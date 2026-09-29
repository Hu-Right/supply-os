/**
 * 行业可见性墙 — 范围判定单测（2026-09-29「8,800元/行业」口径固化）
 *
 * 钉住判定链的六个出口：匿名不墙 / 无订阅不墙 / 演示档旁路（all_category_access）/
 * 非限定档不墙（industry_scoped=0）/ 限定档+已绑行业 → 墙 / 限定档+未绑行业 → 暂不墙+引导。
 * 类目命中检查独立覆盖：桥接命中放行、未命中拦截。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const profile = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/services/industry-profile/resolve", () => ({
  resolveUserIndustryProfile: profile.resolve,
  invalidateProfileCache: vi.fn(),
}));

import { resolveIndustryScope, canAccessNotice } from "@/lib/services/industry-scope";
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

  it("被墙：桥接命中放行、未命中拦截", async () => {
    profile.resolve.mockResolvedValue({ levelIds: [101] });
    const catalog = makeCatalog({ scoped: true });
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[{ 1: 1 }] as RowDataPacket[], []]);
    expect(await canAccessNotice(pool, catalog, 42, 9001)).toBe(true);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    expect(await canAccessNotice(pool, catalog, 42, 9002)).toBe(false);
  });
});
