/**
 * 级联树选项的 wire 键集合取证（命名红线② B 组·树族四条）。
 *
 * 覆盖四个端点的同一个契约：/api/industries/facets、/api/industries/tree、
 * /api/commodity/tree、/api/commodity/tree/prefs。它们的响应体都是 `json(变量)`，
 * 门禁静态面看不见键；键名风险集中在「行→选项」那一步（列是 code / name_zh / name_en）。
 * 这里钉三件事：① 选项键定形（key/nameZh/nameEn）；② 列名与 SQL 别名穿不出服务出口；
 * ③ 脏行的取舍（双语全空就丢，宁缺不把 UGT-I-xxxx 透到界面；非法码不给选项）。
 * 全程假 repo / 假 pool，不连库。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadIndustrySections,
  loadIndustryChildren,
  type IndustryTreeOption,
} from "@/lib/services/industry-facets";
import {
  listCommodityTreeOptions,
  resolveCommodityCodeToPath,
} from "@/lib/services/commodity/tree";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

/** 行业面主表的行口径（列名）；第三行故意双语全空 */
const INDUSTRY_ROWS = [
  { code: "UGT-I-03", name_zh: "制造业", name_en: "Manufacturing" },
  { code: "UGT-I-04", name_zh: "电力、热力生产和供应业", name_en: "" },
  { code: "UGT-I-99", name_zh: "   ", name_en: "" },
];

function fakeIndustryRepo() {
  return {
    listNodesByLevel: vi.fn(async () => INDUSTRY_ROWS),
    listChildNodes: vi.fn(async () => INDUSTRY_ROWS),
  };
}

/** 骨架节点行的列口径：三条 SQL（L1 全量 / 子级 / code IN 点查）都回同一套行 */
function fakeCommodityPool() {
  const query = vi.fn(async (_sql: string) => [
    [{ code: "UGT-01", name_zh: "机械", name_en: "" }],
    [{ code: "UGT-010203", name_zh: "照明器具制造", name_en: "Manufacture of electric lighting equipment" }],
  ]);
  return { query, sqls: () => query.mock.calls.map((c) => String(c[0])) };
}

function snakeKeys(items: Array<Record<string, unknown>>): string[] {
  return items.flatMap((item) => Object.keys(item).filter((k) => SNAKE_KEY.test(k)));
}

describe("行业级联（/api/industries/facets 与 /api/industries/tree）", () => {
  it("门类一层：每项恰为 key/nameZh/nameEn，name_zh 与 name_en 两列都不上网", async () => {
    const sections: IndustryTreeOption[] = await loadIndustrySections(fakeIndustryRepo() as never);

    expect(sections).toEqual([
      { key: "UGT-I-03", nameZh: "制造业", nameEn: "Manufacturing" },
      // 只有中文名时两列都给中文（展示侧不判空），而不是漏一个键
      { key: "UGT-I-04", nameZh: "电力、热力生产和供应业", nameEn: "电力、热力生产和供应业" },
    ]);
    expect(snakeKeys(sections as unknown as Array<Record<string, unknown>>)).toEqual([]);
  });

  it("双语全空的脏行被丢弃（宁缺不给选项，也不把节点码当名称透到界面）", async () => {
    const sections = await loadIndustrySections(fakeIndustryRepo() as never);
    expect(sections.some((s) => s.key === "UGT-I-99")).toBe(false);
  });

  it("子级一层同形制，且按父码取数（不悄悄换成整棵树）", async () => {
    const repo = fakeIndustryRepo();
    const children = await loadIndustryChildren(repo as never, "UGT-I-03");

    expect(repo.listChildNodes).toHaveBeenCalledWith("UGT-I-03");
    for (const item of children) {
      expect([...Object.keys(item)].sort()).toEqual(["key", "nameEn", "nameZh"]);
    }
  });
});

describe("品目骨架级联（/api/commodity/tree）", () => {
  it("parent 为空 → 大类层，每项恰为 3 键", async () => {
    const pool = fakeCommodityPool();
    const options = await listCommodityTreeOptions(pool as never, "");

    expect(options).toEqual([{ key: "UGT-01", nameZh: "机械", nameEn: "" }]);
    expect(snakeKeys(options as unknown as Array<Record<string, unknown>>)).toEqual([]);
    expect(pool.sqls()[0]).toContain("commodity_backbone");
  });

  it("parent 是合法节点码 → 走子级查询，形制不变", async () => {
    const pool = fakeCommodityPool();
    const options = await listCommodityTreeOptions(pool as never, "UGT-01");
    for (const item of options) {
      expect([...Object.keys(item)].sort()).toEqual(["key", "nameEn", "nameZh"]);
    }
  });

  it("parent 形制不符 → 空数组（不给选项，也不报错），且不查库", async () => {
    const pool = fakeCommodityPool();
    expect(await listCommodityTreeOptions(pool as never, "UGT-XY")).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("偏好路径换算（/api/commodity/tree/prefs）", () => {
  it("顶层恰为 l1Code + options 两键", async () => {
    const pool = fakeCommodityPool();
    const resolved = await resolveCommodityCodeToPath(pool as never, "UGT-010203");

    expect([...Object.keys(resolved)].sort()).toEqual(["l1Code", "options"]);
    expect(resolved.l1Code).toBe("UGT-01"); // 大类码由码长切片得出，零额外查库
    for (const item of resolved.options) {
      expect([...Object.keys(item)].sort()).toEqual(["key", "nameEn", "nameZh"]);
    }
  });

  it("无偏好/非法码 → {l1Code:null, options:[]}，形状不变（前端不需要判两种结构）", async () => {
    const pool = fakeCommodityPool();
    const resolved = await resolveCommodityCodeToPath(pool as never, null);
    expect(resolved).toEqual({ l1Code: null, options: [] });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
