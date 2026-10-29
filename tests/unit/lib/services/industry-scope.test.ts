/**
 * 行业可见性墙 — 范围判定与命中检查单测（2026-10-15 G 码退役 / L1 树码接管口径）
 *
 * 判定链的出口照旧钉住：匿名不墙 / 演示档旁路（all_category_access）/
 * 非限定档不墙（industry_scoped=0）/ 限定档+已绑行业 → 墙 / 限定档+未绑行业 → 暂不墙+引导。
 *
 * 2026-10-28 free 化：是否被限唯一由 isEntitled 判定（有订阅读订阅档列，无订阅自动落
 * free 列基线）——"无订阅即全量"分支已删除；free 列=1（新矩阵）时未订阅用户同样被墙。
 *
 * 本批改的是墙的**键**（G 码退役）：
 * - 大类身份 = L1 树码本身，由偏好 commodity_code 前缀纯切片推导（l1CodeOfNode，BB1 不变量），
 *   不再读偏好表 group_code、不再经 l1NodesOfGroup 翻译 —— 墙谓词输入（L1 节点码）不变；
 * - 「推导不出大类」（偏好码形制非法）必须是收窄（空结果 + warn）而不是放开全量 —— 那是付费权益泄漏。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const profile = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/services/industry-profile/resolve", () => ({
  resolveUserIndustryProfile: profile.resolve,
  invalidateProfileCache: vi.fn(),
}));

import {
  resolveIndustryScope, canAccessNotice, noticeInCategory, opportunityInCategory,
} from "@/lib/services/industry-scope";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { Pool, RowDataPacket } from "mysql2/promise";

function makeCatalog(opts: { scoped?: boolean; bypass?: boolean; industryCode?: string | null } = {}) {
  const cells: Array<Record<string, unknown>> = [];
  if (opts.scoped) {
    cells.push({ plan_code: "free", benefit_code: "industry_scoped", value_level: 1, value_num: null, value_amount: null, note_zh: null });
  }
  if (opts.bypass) {
    cells.push({ plan_code: "free", benefit_code: "all_category_access", value_level: 1, value_num: null, value_amount: null, note_zh: null });
  }
  return {
    findActivePlanForUser: vi.fn(async () => (opts.scoped
      ? { plan_code: "free", industry_code: "industryCode" in opts ? opts.industryCode : "UGT-85" }
      : null)),
    loadCells: vi.fn(async (planCodes: string[]) => {
      expect(planCodes).toEqual(["free"]);
      return cells;
    }),
  } as unknown as BenefitSystemRepo;
}

/** 宽表 backbone_path 列值：逐用例改写 */
let wideRows: RowDataPacket[] = [];
const query = vi.fn(async (sql: string, _params?: unknown[]) => {
  const s = String(sql);
  if (s.includes("notice_search")) return [wideRows];
  return [[]];
});
const pool = { query } as unknown as Pool;

/** 宽表一行：backbone_path 列值（null = 该公告没有任何类目节点） */
const wide = (p: string | null) => [{ p } as RowDataPacket];

beforeEach(() => {
  profile.resolve.mockReset();
  query.mockReset();
  wideRows = [];
});

describe("resolveIndustryScope · 判定链", () => {
  it("匿名不墙（转化漏斗口径）", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog(), null)).toEqual({
      scoped: false, l1Code: null, l1Nodes: [], needsIndustry: false,
    });
  });

  it("free 基线列未声明行业限定（迁移前旧数据，industry_scoped 无格）不墙", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog(), 7)).toMatchObject({ scoped: false });
  });

  it("free 基线列=1（新矩阵，2026-10-28 free 化）：未订阅用户同样被墙", async () => {
    profile.resolve.mockResolvedValue({ userId: 7, commodityCode: "UGT-85010101" });
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 7)).toEqual({
      scoped: true, l1Code: "UGT-85", l1Nodes: ["UGT-85"], needsIndustry: false,
    });
  });

  it("全类目旁路（internal_demo 演示档）不墙，且不再往后查行业限定", async () => {
    const catalog = makeCatalog({ bypass: true, scoped: true });
    expect(await resolveIndustryScope(pool, catalog, 42)).toMatchObject({ scoped: false });
    // 热路径约束：同列两格一次取齐，不得再发第二次矩阵查询
    expect(catalog.loadCells).toHaveBeenCalledTimes(1);
  });

  it("非限定档（industry_scoped 缺格/为 0）不墙", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog(), 7)).toMatchObject({ scoped: false });
  });

  it("限定档 + 已绑行业 → 墙启动，l1Code 即偏好的 L1 前缀（零查库推导）", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, commodityCode: "UGT-85010101" });
    // 关键：全程不查 commodity_backbone（大类翻译层已随 G 码退役消失）
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 42)).toEqual({
      scoped: true, l1Code: "UGT-85", l1Nodes: ["UGT-85"], needsIndustry: false,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("限定档但订阅没有行业 → 暂不墙 + needsIndustry 引导", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: true, industryCode: null }), 42)).toEqual({
      scoped: false, l1Code: null, l1Nodes: [], needsIndustry: true,
    });
  });

  it("订阅行业码推导不出大类（脏码）→ 仍算已限定且 nodes 为空，并留下 warn（不静默放开全量）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await resolveIndustryScope(pool, makeCatalog({ scoped: true, industryCode: "UGT-XY" }), 42);
    expect(r).toEqual({ scoped: true, l1Code: null, l1Nodes: [], needsIndustry: false });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("canAccessNotice · 大类命中检查（宽表 backbone_path 口径）", () => {
  it("未被墙一律放行，且不查宽表", async () => {
    expect(await canAccessNotice(pool, makeCatalog({ scoped: false }), 42, 9001)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it("公告祖先链含墙内 L1 → 放行；不含 → 拦", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, commodityCode: "UGT-85010101" });
    const catalog = makeCatalog({ scoped: true });
    wideRows = wide("UGT-85,UGT-8501,UGT-85010101");
    expect(await canAccessNotice(pool, catalog, 42, 9001)).toBe(true);
    wideRows = wide("UGT-43,UGT-4321");
    expect(await canAccessNotice(pool, catalog, 42, 9002)).toBe(false);
  });

  it("公告祖先链命中 L1 的深层节点同样放行（码即全链，等值即包含）", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, commodityCode: "UGT-220101" });
    wideRows = wide("UGT-22,UGT-2201,UGT-220101");
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true, industryCode: "UGT-22" }), 42, 9003)).toBe(true);
  });

  it("公告本身无类目数据（宽表无行 / 列为 NULL）→ 放行，不被脏数据锁死", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, commodityCode: "UGT-85010101" });
    wideRows = [];
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9004)).toBe(true);
    wideRows = wide(null);
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9005)).toBe(true);
  });

  it("被墙但推导不出大类 → 有码公告一律拦（分叉态收窄，不放开）", async () => {
    wideRows = wide("UGT-85,UGT-8501");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true, industryCode: "UGT-XY" }), 42, 9006)).toBe(false);
    warn.mockRestore();
  });

  it("口径铁则：只点查宽表 ns.id，不得再碰桥表与旧字典 level1_id", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, commodityCode: "UGT-85010101" });
    wideRows = wide("UGT-85");
    await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9007);
    // 大类翻译查询已消失（L1 由码前缀推导），命中检查就是唯一一次查库
    const sql = String(query.mock.calls.at(-1)![0]);
    expect(sql).toContain("notice_search");
    expect(sql).toContain("backbone_path");
    expect(sql).toContain("WHERE id = ?");
    expect(sql).not.toMatch(/crm_bid_notice_\w*_codes\b/);
    expect(sql).not.toContain("bid_notices");
    expect(sql).not.toMatch(/level1_id/);
    expect(query.mock.calls).toHaveLength(1);
    expect(query.mock.calls[0]![1]).toEqual([9007]);
  });
});

describe("noticeInCategory · 搜索参考号快速路径口径", () => {
  it("命中 → true；有码不命中与无码均 → false（落回主管道由强制大类谓词自然滤掉）", async () => {
    wideRows = wide("UGT-85,UGT-8501");
    expect(await noticeInCategory(pool, 9008, ["UGT-85"])).toBe(true);
    wideRows = wide("UGT-43");
    expect(await noticeInCategory(pool, 9008, ["UGT-85"])).toBe(false);
    wideRows = [];
    expect(await noticeInCategory(pool, 9008, ["UGT-85"])).toBe(false);
  });

  it("nodes 为空 → false，不因「没条件」判成命中", async () => {
    wideRows = wide("UGT-85");
    expect(await noticeInCategory(pool, 9009, [])).toBe(false);
  });

  it("列里的脏 token 不参与命中：只认 UGT- 形制的码", async () => {
    wideRows = wide("UGT-XY,UGT-8500");
    expect(await noticeInCategory(pool, 9010, ["UGT-XY"])).toBe(false);
    expect(await noticeInCategory(pool, 9010, ["UGT-8500"])).toBe(true);
  });
});

describe("opportunityInCategory · 商机侧（经关联公告宽表口径）", () => {
  it("关联公告祖先链含该大类 L1 → true；不含 → false", async () => {
    wideRows = wide("UGT-85,UGT-8501");
    expect(await opportunityInCategory(pool, 77, "UGT-85")).toBe(true);
    wideRows = wide("UGT-21,UGT-22");
    expect(await opportunityInCategory(pool, 77, "UGT-85")).toBe(false);
  });

  it("关联公告无类目数据（无宽表行/列为空）→ false（拒绝解锁）：判不准时不越权", async () => {
    wideRows = [];
    expect(await opportunityInCategory(pool, 78, "UGT-85")).toBe(false);
    wideRows = wide(null);
    expect(await opportunityInCategory(pool, 78, "UGT-85")).toBe(false);
  });

  it("未绑大类 → false 且不查库", async () => {
    expect(await opportunityInCategory(pool, 79, null)).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("脏 token 不参与命中：只认 UGT- 形制的节点码", async () => {
    wideRows = wide("UGT-XY,43211503");
    expect(await opportunityInCategory(pool, 80, "UGT-85")).toBe(false);
  });
});

