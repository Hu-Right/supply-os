/**
 * notice-search 两个聚合端点（国家分布 / 热门标签）的 wire 键集合取证（红线② B 组收敛）。
 *
 * 这两条登记项停在 B 的意思是「sweep 实测当时没有 snake 键，但路由侧没 mapper 可看」。
 * 探针只证一次，钉不住以后：它们的键名风险在 SQL 别名（`cnt`、`name_zh`），
 * 一旦有人把行对象直接 map 出去，wire 就变回列名。本文件用假 pool 把这件事钉死，
 * 顺便钉住「热门标签读的是 backbone 表」这类取数口径（改动会让这里红，而不是静默换一套数）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getHotTopics, clearHotTopicsCache, HOT_TOP_GROUPS_SQL } from "@/lib/services/notice-search/hot-topics";
import { getNoticeCountries, clearCountriesCache } from "@/lib/services/notice-search/countries";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

const ALIAS_ROWS = [
  // country_aliases 的查找键取自 alias 列（一种写法一行），所以同国家的多种写法必须分行登记；
  // 这也是本例要钉的东西：两种写法归一到同一 canonical，计数才能合到一个项上。
  { canonical: "CHINA", country_code: "CN", alias: "China", kind: "country", name_i18n: JSON.stringify({ zh: "中国" }) },
  { canonical: "CHINA", country_code: "CN", alias: "中国", kind: "country", name_i18n: JSON.stringify({ zh: "中国" }) },
];
const COUNTRY_ROWS = [
  { country: "China", cnt: 5 },
  { country: "中国", cnt: 2 },
];
const BACKBONE_ROWS = [
  { code: "UGT-A01", name_zh: "机械", cnt: 12 },
  { code: "UGT-A02", name_zh: "纺织", cnt: 3 },
];

/** 按 SQL 文本分派的假 pool：三条语句各回一套列名口径的行 */
function fakePool() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("country_aliases")) return [ALIAS_ROWS];
    if (sql.includes("commodity_backbone")) return [BACKBONE_ROWS];
    return [COUNTRY_ROWS];
  });
  return { query, sqls: () => query.mock.calls.map((c) => String(c[0])) };
}

beforeEach(() => {
  clearCountriesCache();
  clearHotTopicsCache();
});

describe("GET /api/notices/countries", () => {
  it("每项只出 country + count，SQL 别名 cnt 不带上网", async () => {
    const pool = fakePool();
    const data = await getNoticeCountries(pool as never);

    expect(data.length).toBeGreaterThan(0);
    for (const item of data) {
      expect([...Object.keys(item)].sort()).toEqual(["count", "country"]);
      expect(typeof item.country).toBe("string");
      expect(typeof item.count).toBe("number");
    }
    expect(JSON.stringify(data)).not.toContain("cnt");
  });

  it("计数按归一后的标准名合并（同一国家的多种写法不会裂成两项各带一份计数）", async () => {
    const pool = fakePool();
    const data = await getNoticeCountries(pool as never);
    const total = data.reduce((sum, item) => sum + item.count, 0);
    // 两行输入共 7 条公告；归一到 CHINA 一项（不裂成两项、也不丢）
    expect(total).toBe(7);
    expect(data).toEqual([{ country: "CHINA", count: 7 }]);
  });
});

describe("GET /api/notices/hot-topics", () => {
  it("顶层只有 countries / industries 两个键", async () => {
    const pool = fakePool();
    const data = await getHotTopics(pool as never);
    expect([...Object.keys(data)].sort()).toEqual(["countries", "industries"]);
  });

  it("industries 每项 3 键：code/nameZh/count，列名 name_zh 与别名 cnt 都不许上网", async () => {
    const pool = fakePool();
    const data = await getHotTopics(pool as never);

    expect(data.industries.length).toBeGreaterThan(0);
    for (const item of data.industries) {
      expect([...Object.keys(item)].sort()).toEqual(["code", "count", "nameZh"]);
      expect(Object.keys(item).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    }
    expect(data.industries[0].nameZh).toBe("机械");
    expect(data.industries[0].count).toBe(12);
    expect(JSON.stringify(data)).not.toMatch(/name_zh|"cnt"/);
  });

  it("热门标签仍盯 backbone 表（口径 SSOT，被人改回旧字典时这里先红）", async () => {
    const pool = fakePool();
    await getHotTopics(pool as never);
    expect(pool.sqls().some((sql) => sql.includes(HOT_TOP_GROUPS_SQL.trim().slice(0, 40)))).toBe(true);
    expect(HOT_TOP_GROUPS_SQL).toContain("commodity_backbone");
  });
});
