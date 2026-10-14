/**
 * mode-resolver — 类目条件与 prefs 放宽序列必须由节点码给出（Task 10）
 *
 * 2026-10-11 backbone 化：default / prefs 的类目谓词统一为骨架节点码，不再碰 levelN 列。
 * 旧品类字典退役（2026-10-13）：画像直接携带最深节点码（commodityCode），
 * prefs 的放宽序列由它的**祖先链**推出来（`commodityNodeChain`，码长即层级，不查库），
 * 底线仍是 L2；旧 `?code_id`（字典行 id）外链兼容分支随之删除——老链接丢类目过滤、
 * 其余参数照常（优雅降级）。
 *
 * 保留的旧语义一条都不动：
 * - 换不出节点 → 忽略类目过滤（不报错、不放宽成"命中全部"）；
 * - 匿名 / 无画像 → 短路，不发查询；
 * - prefs 分数口径 L4/L5→5、L2/L3→2（与 format.matchScoreToTierLabel 阈值对齐）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const profile = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/services/industry-profile/resolve", () => ({
  resolveUserIndustryProfile: profile.resolve,
  invalidateProfileCache: vi.fn(),
}));

import { resolveMode } from "@/lib/services/search-orchestrator/mode-resolver";
import { validateParams } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

const sqlLog: string[] = [];
function fakePool(): Pool {
  return {
    query: async (sql: string) => {
      sqlLog.push(String(sql));
      return [[]];
    },
  } as unknown as Pool;
}

const params = (over: Record<string, unknown>) => validateParams(over as never);

beforeEach(() => {
  profile.resolve.mockReset();
  sqlLog.length = 0;
});

describe("resolveMode · default 模式（字典 code_id 外链已退役）", () => {
  it("无类目参数 → 无类目条件，且不发查询", async () => {
    const r = await resolveMode(fakePool(), params({}));
    expect(r.kind).toBe("search");
    expect(r.category).toBeNull();
    expect(sqlLog).toEqual([]);
  });

  it("旧 code_id / industry_id 外链不再被识别：优雅降级为无类目过滤", async () => {
    // 字典行 id 参数随旧品类字典退役失效；validateParams 不再收集它，
    // resolveMode 不查库、不报错、不放开全量语义
    const r = await resolveMode(fakePool(), params({ commodityPath: "UGT-4321150301" }));
    expect(r.kind).toBe("search");
    // URL 合法节点码由 filter-builder 直接消费，mode-resolver 不再产出 category
    expect(r.category).toBeNull();
    expect(sqlLog).toEqual([]);
  });
});

describe("resolveMode · prefs 的渐进放宽序列", () => {
  it("最深节点码 → 祖先链逐层出节点码（深→浅，底线 L2，分数 5/5/2/2）", async () => {
    profile.resolve.mockResolvedValue({
      userId: 7,
      commodityCode: "UGT-4321150301",
      deepestLevel: 5,
      groupCode: "UGT-G-07",
      industryTitleZh: "夹具",
    });
    const r = await resolveMode(fakePool(), params({ mode: "prefs", userId: 7 }));
    expect(r.kind).toBe("search");
    expect(r.profileNodes).toEqual([
      { node: "UGT-4321150301", level: 5, score: 5 },
      { node: "UGT-43211503", level: 4, score: 5 },
      { node: "UGT-432115", level: 3, score: 2 },
      { node: "UGT-4321", level: 2, score: 2 },
    ]);
    // L1 不进序列：放宽到大类等于不限行业（旧口径同一底线）
    expect(r.profileNodes!.some((e) => e.level === 1)).toBe(false);
  });

  it("只选到类（L4）→ 序列从 L4 起，浅于 L2 的不出现", async () => {
    profile.resolve.mockResolvedValue({
      userId: 8,
      commodityCode: "UGT-30883401",
      deepestLevel: 4,
      groupCode: "UGT-G-07",
      industryTitleZh: "夹具",
    });
    const r = await resolveMode(fakePool(), params({ mode: "prefs", userId: 8 }));
    expect(r.profileNodes).toEqual([
      { node: "UGT-30883401", level: 4, score: 5 },
      { node: "UGT-308834", level: 3, score: 2 },
      { node: "UGT-3088", level: 2, score: 2 },
    ]);
  });

  it("画像码形制非法（脏数据）→ no_prefs（resolve 侧已挡，此处钉双保险）", async () => {
    profile.resolve.mockResolvedValue({
      userId: 9,
      commodityCode: "43211503",
      deepestLevel: 0,
      groupCode: null,
      industryTitleZh: null,
    });
    const r = await resolveMode(fakePool(), params({ mode: "prefs", userId: 9 }));
    expect(r.kind).toBe("no-prefs");
    expect(r.profileNodes).toBeNull();
  });

  it("匿名 / 无画像 → no_prefs，不查库", async () => {
    const a = await resolveMode(fakePool(), params({ mode: "prefs" }));
    expect(a.kind).toBe("no-prefs");
    profile.resolve.mockResolvedValue(null);
    const b = await resolveMode(fakePool(), params({ mode: "prefs", userId: 11 }));
    expect(b.kind).toBe("no-prefs");
    expect(sqlLog).toEqual([]);
  });

  it("recommended 仍委托既有推荐服务（行为评分语义无法 filter 化）", async () => {
    const r = await resolveMode(fakePool(), params({ mode: "recommended", userId: 7 }));
    expect(r.kind).toBe("delegate-recommended");
    expect(r.category).toBeNull();
    expect(r.profileNodes).toBeNull();
  });
});
