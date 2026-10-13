/**
 * mode-resolver — 类目条件与 prefs 放宽序列必须由节点码给出（Task 10）
 *
 * 改前：default 拿 `?code_id` 去旧字典查出 (id, level) 拼 levelN 过滤；prefs 拿画像五级
 * 字典 id 逐级拼 precise_levelN。两处都建立在旧字典 id 空间上，而公告归属已经改由
 * `backbone_path` 表达 —— 两套键在同一请求里并存就是分叉温床。
 * 改后：两处都换成骨架节点码。prefs 的放宽序列直接由最深节点的**祖先链**推出来
 * （`commodityNodeChain`，码长即层级，不需要再查库取各级 id），底线仍是 L2。
 *
 * 保留的旧语义一条都不动：
 * - 换不出节点 → 忽略类目过滤（不报错、不放宽成"命中全部"）；
 * - codeId=0 / 匿名 / 无画像 → 短路，不发查询；
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

/** 字典行 + 骨架行的最小夹具：id 900 = 8 位品目码 43211503 → 树里 L5 节点 */
const DICT: Record<number, { code: string; level: number }> = {
  900: { code: "43211503", level: 5 },
  300: { code: "30883400", level: 4 },
  101: { code: "A", level: 1 }, // 旧字典的字母容器层：新分类里没有对应层，必须被忽略
};
const NODE_BY_CODE: Record<string, string> = {
  "43211503": "UGT-4321150301", // 字典品目码 → 新树 L5（码内 10 位）
  "308834": "UGT-30883401", //     字典类码（前 6 位）→ 新树 L4（码内 8 位）
};

const sqlLog: string[] = [];
function fakePool(found = true): Pool {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      sqlLog.push(s);
      if (s.includes("crm_unspsc_codes")) {
        const ids = (params as number[]) ?? [];
        return [ids.map((id) => ({ id, ...DICT[id] })).filter((r) => r.code)];
      }
      if (s.includes("crm_commodity_backbone")) {
        if (!found) return [[]];
        // 品目/类：按 unspsc_prefix 等值；段：按 LEFT(unspsc_prefix,2)
        const want = String((params as unknown[])?.[1] ?? (params as unknown[])?.[0] ?? "");
        const code = NODE_BY_CODE[want] ?? NODE_BY_CODE[want.slice(0, 8)] ?? NODE_BY_CODE[want.slice(0, 6)];
        return [code ? [{ code, name_zh: "夹具", name_en: "fixture", group_code: "UGT-G-07" }] : []];
      }
      return [[]];
    },
  } as unknown as Pool;
}

const params = (over: Record<string, unknown>) => validateParams(over as never);

beforeEach(() => {
  profile.resolve.mockReset();
  sqlLog.length = 0;
});

describe("resolveMode · default 的类目条件", () => {
  it("code_id 能落到骨架节点 → 给出节点码", async () => {
    const r = await resolveMode(fakePool(), params({ codeId: 900 }));
    expect(r.kind).toBe("search");
    expect(r.category).toEqual({ node: "UGT-4321150301" });
  });

  it("code_id 在树里换不出节点 → 忽略类目过滤（不报错、不放开全量）", async () => {
    const r = await resolveMode(fakePool(false), params({ codeId: 900 }));
    expect(r.kind).toBe("search");
    expect(r.category).toBeNull();
  });

  it("codeId=0 短路：一条查询都不发", async () => {
    const r = await resolveMode(fakePool(), params({}));
    expect(r.category).toBeNull();
    expect(sqlLog).toEqual([]);
  });

  it("旧字典的字母容器层（level=1）不参与：只给容器 id 就当没有类目", async () => {
    const r = await resolveMode(fakePool(), params({ codeId: 101 }));
    expect(r.category).toBeNull();
  });
});

describe("resolveMode · prefs 的渐进放宽序列", () => {
  it("最深节点 → 祖先链逐层出节点码（深→浅，底线 L2，分数 5/5/2/2）", async () => {
    profile.resolve.mockResolvedValue({
      userId: 7, deepestLevel: 5, groupCode: "UGT-G-07",
      levelIds: [101, null, null, null, 900],
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
    profile.resolve.mockResolvedValue({ userId: 8, deepestLevel: 4, levelIds: [101, null, null, 300, null] });
    const r = await resolveMode(fakePool(), params({ mode: "prefs", userId: 8 }));
    expect(r.profileNodes).toEqual([
      { node: "UGT-30883401", level: 4, score: 5 },
      { node: "UGT-308834", level: 3, score: 2 },
      { node: "UGT-3088", level: 2, score: 2 },
    ]);
  });

  it("画像换不出任何节点 → no_prefs（与旧实现一致，交给前端引导）", async () => {
    profile.resolve.mockResolvedValue({ userId: 9, deepestLevel: 5, levelIds: [101, null, null, null, 900] });
    const r = await resolveMode(fakePool(false), params({ mode: "prefs", userId: 9 }));
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
