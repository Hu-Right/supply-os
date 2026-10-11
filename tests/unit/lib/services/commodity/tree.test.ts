/**
 * 品目分类树读层单测
 *
 * 本文件最重要的用例是「筛选键必须是 UNSPSC 前缀，不是 UGT-C 顺排码尾巴」：
 * 2026-10-11 实测生产库 58/58 段两者全部不同序（UGT-C-01 的 unspsc_code 是 10000000、
 * UGT-C-56 是 93000000），而宽表 code_path 的 token 抽样 200/200 全是 UNSPSC 前缀。
 * 一旦有人「顺手用 code 的尾巴当值」，界面看起来正常、筛出来的却是另一批公告，
 * 且不会报错 —— 所以这里把键的取值和 SQL 形制一起钉住。
 */
import { describe, it, expect } from "vitest";
import {
  isCommodityPathKey,
  commodityPathChain,
  listSegmentsOfGroup,
  listChildrenOfPrefix,
  listCommodityTreeOptions,
  resolveUnspscIdsToCommodityPath,
} from "@/lib/services/commodity/tree";
import { mergeAncestorPrefixes } from "@/lib/services/commodity/path";
import type { Pool } from "mysql2/promise";

interface Call { sql: string; params: unknown[] }

type Rows = unknown[] | ((sql: string) => unknown[]);

/** 记录调用并按 SQL 特征返回预置行（行用普通对象，不扮 RowDataPacket） */
function fakePool(rows: Rows = []): { pool: Pool; calls: Call[] } {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql: String(sql), params: (params ?? []) as unknown[] });
      return [typeof rows === "function" ? rows(String(sql)) : rows];
    },
  } as unknown as Pool;
  return { pool, calls };
}

/** 段节点：UGT-C-41 的 unspsc_code 是 72000000（码尾巴 41 与前缀 72 不同序的真实形态） */
const SEG_ROW = { code: "UGT-C-41", unspsc_code: "72000000", name_zh: "建筑、设施施工和维护服务", name_en: "Facility Construction and Maintenance Services" };

describe("isCommodityPathKey", () => {
  it("只接受 2/4/6/8 位数字", () => {
    for (const ok of ["72", "7210", "721015", "72101501"]) expect(isCommodityPathKey(ok)).toBe(true);
    for (const bad of ["7", "721", "", "abc", "721015011", "72-", " 72", "UGT-C-41"]) {
      expect(isCommodityPathKey(bad)).toBe(false);
    }
  });
});

describe("listSegmentsOfGroup（大类 → 段）", () => {
  it("返回的 key 是 UNSPSC 前缀，不是 UGT-C 码尾巴", async () => {
    const { pool } = fakePool([SEG_ROW]);
    const options = await listSegmentsOfGroup(pool, "UGT-G-11");
    expect(options).toHaveLength(1);
    expect(options[0].key).toBe("72");
    expect(options[0].key).not.toBe("41");
    expect(options[0].code).toBe("UGT-C-41");
  });

  it("按常量段前缀补零成 8 位码等值查库（名称一律回库里取，代码不持有名称）", async () => {
    const { pool, calls } = fakePool([SEG_ROW]);
    await listSegmentsOfGroup(pool, "UGT-G-11");
    expect(calls[0].params).toEqual(["72000000"]);
    expect(calls[0].sql).toContain("level = 'segment'");
    expect(calls[0].sql).toContain("unspsc_code IN");
  });

  it("非 32 类常量内的大类返回空，不猜", async () => {
    const { pool, calls } = fakePool([SEG_ROW]);
    expect(await listSegmentsOfGroup(pool, "UGT-G-99")).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("listChildrenOfPrefix（段 → 族 → 类 → 品目）", () => {
  it("父节点用 unspsc_code 等值定位：不出现 LEFT(...) 函数包裹，索引可用", async () => {
    const { pool, calls } = fakePool([
      { code: "UGT-C-4101", unspsc_code: "72100000", name_zh: "建筑、设施维护和修理服务", name_en: "Building and Facility Maintenance Services" },
    ]);
    const options = await listChildrenOfPrefix(pool, "72");
    expect(options[0].key).toBe("7210");
    const sql = calls[0].sql;
    expect(sql).toContain("p.unspsc_code = ?");
    expect(sql).not.toMatch(/LEFT\s*\(/);
    expect(calls[0].params).toEqual(["72000000", "segment"]);
  });

  it("每往下一层，键长度加两位且层级随之切换", async () => {
    const cases: Array<[string, string]> = [["72", "segment"], ["7210", "family"], ["721015", "class"]];
    for (const [prefix, level] of cases) {
      const { pool, calls } = fakePool([]);
      await listChildrenOfPrefix(pool, prefix);
      expect(calls[0].params).toEqual([prefix + "0".repeat(8 - prefix.length), level]);
    }
  });

  it("品目层（8 位）没有下一级；非法长度不查库直接空", async () => {
    const { pool, calls } = fakePool([SEG_ROW]);
    expect(await listChildrenOfPrefix(pool, "72101501")).toEqual([]);
    expect(await listChildrenOfPrefix(pool, "721")).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("listCommodityTreeOptions（级联入口）", () => {
  it("大类码走段查询，数字前缀走子级查询", async () => {
    const a = fakePool([]);
    await listCommodityTreeOptions(a.pool, "UGT-G-11");
    expect(a.calls[0].sql).toContain("level = 'segment'");

    const b = fakePool([]);
    await listCommodityTreeOptions(b.pool, "7210");
    expect(b.calls[0].sql).toContain("ch.parent_code = p.code");
  });

  it("空 parent / 乱码 parent 一律空返回（不给界面假选项）", async () => {
    const { pool, calls } = fakePool([SEG_ROW]);
    expect(await listCommodityTreeOptions(pool, "")).toEqual([]);
    expect(await listCommodityTreeOptions(pool, "' OR 1=1")).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("resolveUnspscIdsToCommodityPath（旧偏好 → 品目树路径）", () => {
  it("只认 level>=2：旧字典 level=1 是 A..J 容器，新分类里没有这一层", async () => {
    const dict = fakePool((sql) =>
      sql.includes("crm_unspsc_codes")
        ? [
            { id: 100, code: "A", level: 1 },
            { id: 100081, code: "72000000", level: 2 },
            { id: 100082, code: "72100000", level: 3 },
          ]
        : [
            { code: "UGT-C-41", unspsc_code: "72000000", name_zh: "建筑、设施施工和维护服务", name_en: "Construction" },
            { code: "UGT-C-4101", unspsc_code: "72100000", name_zh: "建筑、设施维护和修理服务", name_en: "Maintenance" },
          ],
    );
    const resolved = await resolveUnspscIdsToCommodityPath(dict.pool, [100, 100081, 100082]);
    const nodeQuery = dict.calls.find((c) => c.sql.includes("crm_commodity_nodes"))!;
    expect(nodeQuery.params).toEqual(["72000000", "72100000"]);
    expect(resolved.options.map((o) => o.key)).toEqual(["72", "7210"]);
    // 大类由段前缀反查常量：72 段归 UGT-G-11（建筑施工与运维服务）
    expect(resolved.groupCode).toBe("UGT-G-11");
  });

  it("字典里的码在树里没有对应节点时不编造选项", async () => {
    const dict = fakePool((sql) =>
      sql.includes("crm_unspsc_codes") ? [{ id: 1, code: "99000000", level: 2 }] : [],
    );
    const resolved = await resolveUnspscIdsToCommodityPath(dict.pool, [1]);
    expect(resolved.options).toEqual([]);
  });

  it("无有效 id 时不查库", async () => {
    const { pool, calls } = fakePool([]);
    expect(await resolveUnspscIdsToCommodityPath(pool, [null, undefined, 0])).toEqual({
      groupCode: null,
      options: [],
    });
    expect(calls).toHaveLength(0);
  });
});

describe("commodityPathChain — 筛选键自带祖先链（五级下拉的点亮依据）", () => {
  it("选到哪一层，就把那一层以上的链补全", () => {
    expect(commodityPathChain("41")).toEqual(["41", "", "", ""]);
    expect(commodityPathChain("4101")).toEqual(["41", "4101", "", ""]);
    expect(commodityPathChain("410101")).toEqual(["41", "4101", "410101", ""]);
    expect(commodityPathChain("41010105")).toEqual(["41", "4101", "410101", "41010105"]);
  });

  it("形制不符返回全空：不拿一个错键去点亮任何一层", () => {
    for (const bad of ["", "4", "410", "41010", "4101010", "abcdefgh", "41' OR 1=1", "UGT-C-41"]) {
      expect(commodityPathChain(bad)).toEqual(["", "", "", ""]);
    }
    expect(commodityPathChain(null)).toEqual(["", "", "", ""]);
  });

  it("与写入端同一套键形制：链上每一项都是 code_path 里可能出现的 token", () => {
    // 写入端 unspscAncestorPrefixes 产出的就是「两位一级、遇 00 即停」的前缀集；
    // 读取端反推的链必须能在其中找到位置，否则下拉选中值永远命中不到公告
    const written = mergeAncestorPrefixes(["41010105"]);
    for (const key of commodityPathChain("41010105")) {
      if (!key) continue;
      expect(written).toContain(key);
    }
  });
});
