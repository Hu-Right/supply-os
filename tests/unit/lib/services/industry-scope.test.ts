/**
 * 行业可见性墙 — 范围判定与命中检查单测（2026-10-11 backbone 口径固化）
 *
 * 判定链的六个出口照旧钉住：匿名不墙 / 无订阅不墙 / 演示档旁路（all_category_access）/
 * 非限定档不墙（industry_scoped=0）/ 限定档+已绑大类 → 墙 / 限定档+未绑大类 → 暂不墙+引导。
 *
 * 本批改的是命中的**输入与数据源**（用户裁决「不需要任何旧数据，全部以最新的为准」）：
 * - 输入从旧字典 level=1 行 id 换成 prefs.group_code → 骨架 L1 节点码。旧口径实测就是
 *   A..J 十个字母容器：user=1 订 UGT-G-25、user=10 订 UGT-G-17，两人 level1_id 都是 109，
 *   旧实现下两人可见公告**完全相同**（各 40,171 条，temp/probe77/probe78）；
 * - 公告侧不再 JOIN 桥表，改点查宽表 backbone_path：桥表 notice_id 是外部编号，与另一公告
 *   的内部 id 实测撞号 21,524 行，旧实现靠主表中转绕开，现在根本不碰桥表；
 * - 「大类挂不上 L1」必须是收窄（空结果）而不是放开全量 —— 那是付费权益泄漏。
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

function makeCatalog(opts: { plan?: { plan_code: string } | null; scoped?: boolean; bypass?: boolean } = {}) {
  return {
    findActivePlanForUser: vi.fn(async () => (opts.plan === undefined ? { plan_code: "business" } : opts.plan)),
    isEntitled: vi.fn(async (_uid: number, code: string) =>
      code === "all_category_access" ? !!opts.bypass : code === "industry_scoped" ? !!opts.scoped : false),
  } as unknown as BenefitSystemRepo;
}

/** 骨架 L1 行（列别名 g / node）：UGT-G-14 故意挂两个，钉「多值全都要参与命中」 */
const L1_ROWS = [
  { g: "UGT-G-25", node: "UGT-85" },
  { g: "UGT-G-14", node: "UGT-21" },
  { g: "UGT-G-14", node: "UGT-22" },
  // 库里挂着但码形制非法的行：l1NodesOfGroup 必须丢掉，不能让脏码进谓词变成「永不命中」
  { g: "UGT-G-14", node: "UGT-XY" },
];

/** 宽表 backbone_path 列值：逐用例改写（tree 的 L1 图有 10 分钟模块级缓存，全用例共用 L1_ROWS） */
let wideRows: RowDataPacket[] = [];
// 形参必须把 params 一并声明：否则 mock.calls 的元组只有一位，取不到传参（TS2493）
const query = vi.fn(async (sql: string, _params?: unknown[]) => {
  const s = String(sql);
  if (s.includes("crm_commodity_backbone")) return [L1_ROWS];
  if (s.includes("crm_notice_search")) return [wideRows];
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
      scoped: false, groupCode: null, groupNodes: [], needsIndustry: false,
    });
  });

  it("无生效订阅（普通用户）不墙", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog({ plan: null }), 7)).toMatchObject({ scoped: false });
  });

  it("全类目旁路（internal_demo 演示档）不墙，且不再查行业限定", async () => {
    const catalog = makeCatalog({ bypass: true, scoped: false });
    expect(await resolveIndustryScope(pool, catalog, 42)).toMatchObject({ scoped: false });
    expect(catalog.isEntitled).toHaveBeenCalledWith(42, "all_category_access");
    expect(catalog.isEntitled).not.toHaveBeenCalledWith(42, "industry_scoped");
  });

  it("非限定档（industry_scoped=0，个人三档）不墙", async () => {
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: false }), 7)).toMatchObject({ scoped: false });
  });

  it("限定档 + 已绑大类 → 墙启动，带出大类码与其 L1 节点码", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, groupCode: "UGT-G-25", levelIds: [109, null, null, null, 100852] });
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 42)).toEqual({
      scoped: true, groupCode: "UGT-G-25", groupNodes: ["UGT-85"], needsIndustry: false,
    });
  });

  it("限定档但画像里没有大类码 → 暂不墙 + needsIndustry 引导（旧 level1 容器不参与判定）", async () => {
    profile.resolve.mockResolvedValue({ userId: 42, groupCode: null, levelIds: [109, null, null, null, null] });
    expect(await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 42)).toEqual({
      scoped: false, groupCode: null, groupNodes: [], needsIndustry: true,
    });
  });

  it("大类合法但库里挂不上任何 L1 行 → 仍算已限定且 nodes 为空，并留下 warn（不静默放开全量）", async () => {
    // UGT-G-17 是 32 类里的真大类，但本文件的 L1 夹具没给它行——这就是常量与库分叉的形状
    profile.resolve.mockResolvedValue({ groupCode: "UGT-G-17" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await resolveIndustryScope(pool, makeCatalog({ scoped: true }), 42);
    expect(r).toEqual({ scoped: true, groupCode: "UGT-G-17", groupNodes: [], needsIndustry: false });
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
    profile.resolve.mockResolvedValue({ groupCode: "UGT-G-25" });
    const catalog = makeCatalog({ scoped: true });
    wideRows = wide("UGT-85,UGT-8501,UGT-85010101");
    expect(await canAccessNotice(pool, catalog, 42, 9001)).toBe(true);
    wideRows = wide("UGT-43,UGT-4321");
    expect(await canAccessNotice(pool, catalog, 42, 9002)).toBe(false);
  });

  it("多 L1 的大类：任一节点命中即放行（只取第一个就是静默漏类）", async () => {
    profile.resolve.mockResolvedValue({ groupCode: "UGT-G-14" });
    wideRows = wide("UGT-22,UGT-2201");
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9003)).toBe(true);
  });

  it("公告本身无类目数据（宽表无行 / 列为 NULL）→ 放行，不被脏数据锁死", async () => {
    profile.resolve.mockResolvedValue({ groupCode: "UGT-G-25" });
    wideRows = [];
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9004)).toBe(true);
    wideRows = wide(null);
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9005)).toBe(true);
  });

  it("被墙但大类挂不上 L1 → 有码公告一律拦（分叉态收窄，不放开）", async () => {
    profile.resolve.mockResolvedValue({ groupCode: "UGT-G-17" });
    wideRows = wide("UGT-85,UGT-8501");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9006)).toBe(false);
    warn.mockRestore();
  });

  it("口径铁则：只点查宽表 ns.id，不得再碰桥表与旧字典 level1_id", async () => {
    profile.resolve.mockResolvedValue({ groupCode: "UGT-G-25" });
    wideRows = wide("UGT-85");
    await canAccessNotice(pool, makeCatalog({ scoped: true }), 42, 9007);
    // L1 映射查询在前，命中检查取最后一次
    const sql = String(query.mock.calls.at(-1)![0]);
    expect(sql).toContain("crm_notice_search");
    expect(sql).toContain("backbone_path");
    expect(sql).toContain("WHERE id = ?");
    expect(sql).not.toContain("crm_bid_notice_unspsc_codes");
    expect(sql).not.toContain("crm_bid_notices");
    expect(sql).not.toMatch(/level1_id/);
    expect(query.mock.calls.at(-1)![1]).toEqual([9007]);
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
  it("关联公告祖先链含该大类的 L1 → true；不含 → false", async () => {
    wideRows = wide("UGT-85"); // UGT-G-25 的 L1
    expect(await opportunityInCategory(pool, 77, "UGT-G-25")).toBe(true);
    wideRows = wide("UGT-21,UGT-22"); // UGT-G-14 挂两个 L1，任一命中即可
    expect(await opportunityInCategory(pool, 77, "UGT-G-14")).toBe(true);
    wideRows = wide("UGT-85");
    expect(await opportunityInCategory(pool, 77, "UGT-G-14")).toBe(false);
  });

  it("关联公告无类目数据（无宽表行/列为空）→ false（拒绝解锁）：判不准时不越权", async () => {
    wideRows = [];
    expect(await opportunityInCategory(pool, 78, "UGT-G-25")).toBe(false);
    wideRows = wide(null);
    expect(await opportunityInCategory(pool, 78, "UGT-G-25")).toBe(false);
  });

  it("未绑大类 → false 且不查库", async () => {
    expect(await opportunityInCategory(pool, 79, null)).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("脏 token 不参与命中：只认 UGT- 形制的节点码", async () => {
    wideRows = wide("UGT-XY,43211503");
    expect(await opportunityInCategory(pool, 80, "UGT-G-25")).toBe(false);
  });

  it("大类挂不上 L1（分叉态）→ false，不放开", async () => {
    wideRows = wide("UGT-21");
    expect(await opportunityInCategory(pool, 81, "UGT-G-99")).toBe(false);
  });
});
