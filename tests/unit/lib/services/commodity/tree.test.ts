/**
 * 品目骨架树读层单测（fake pool，无库）
 *
 * 钉住的口径：
 * - 选项只含 code/name_zh/name_en 三列；名称缺失透传空串，不在读层编造；
 * - 子级走 parent_code 等值（idx_parent），祖先链由码自身截断（BB1 不变量），绝不 LEFT() 包裹；
 * - parent 为空返回 L1 大类层（2026-10-15 G 码退役：大类身份 = L1 树码，切片即得，零查库）；
 * - 出现已退役的大类维表族（`crm_commodity_group*`）同样是回退 —— 段归属已改为从骨架推导（ADR-0009）。
 */
import { describe, expect, it } from "vitest";
import { LEGACY_DICT_TABLE } from "../../../../helpers/legacy-targets";
import {
  commodityNodeChain,
  commodityNodeLevel,
  isCommodityNodeKey,
  l1CodeOfNode,
  listChildrenOfNode,
  listCommodityTreeOptions,
  resolveCommodityCodeToPath,
} from "@/lib/services/commodity/tree";
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

/** 全部被调用过的 SQL 里都不许出现旧树表名 */
function assertNoLegacyTree(calls: Call[]) {
  for (const c of calls) expect(c.sql).not.toContain("crm_commodity_nodes");
}

const L1_ROW = { code: "UGT-01", name_zh: "建筑施工与运维服务", name_en: "" };
const L2_ROW = { code: "UGT-0101", name_zh: "建筑施工服务", name_en: "" };
const L3_ROW = { code: "UGT-010101", name_zh: "施工服务", name_en: "" };
const L5_ROW = { code: "UGT-0101010101", name_zh: "干洗厂施工和改建服务", name_en: "Dry cleaning construction" };

describe("isCommodityNodeKey / commodityNodeLevel", () => {
  it("只认 UGT- 前缀 + 偶数位（2/4/6/8/10）", () => {
    for (const ok of ["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]) {
      expect(isCommodityNodeKey(ok)).toBe(true);
    }
    for (const bad of ["721015", "UGT-C-41", "UGT-0101011", "UGT-", "ugt-01", "UGT-011"]) {
      expect(isCommodityNodeKey(bad)).toBe(false);
    }
    expect(commodityNodeLevel("UGT-010101")).toBe(3);
    expect(commodityNodeLevel("UGT-0101011")).toBe(0);
  });
});

describe("commodityNodeChain — 祖先链由码自身截断", () => {
  it("五级定长形状，未选层为空串；l1CodeOfNode 取链第一位", () => {
    expect(commodityNodeChain("UGT-010101")).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "", ""]);
    expect(l1CodeOfNode("UGT-0101010101")).toBe("UGT-01");
    expect(l1CodeOfNode("UGT-01")).toBe("UGT-01");
    expect(l1CodeOfNode("721015")).toBe("");
    expect(l1CodeOfNode(null)).toBe("");
  });
});

describe("listCommodityTreeOptions — 分派入口", () => {
  it("parent 为空返回 L1 大类层（2026-10-15 G 码退役后第一级也走树）", async () => {
    const { pool, calls } = fakePool([L1_ROW]);
    const options = await listCommodityTreeOptions(pool, "");
    expect(calls[0].sql).toContain("level = 1");
    expect(calls[0].sql).toContain("status = 1");
    expect(options[0].key).toBe("UGT-01");
    expect(options[0].nameZh).toBe("建筑施工与运维服务");
    assertNoLegacyTree(calls);
  });

  it("节点码走子级分支（L1 码即取中类），脏值一律空返回", async () => {
    const b = fakePool([L3_ROW]);
    await listCommodityTreeOptions(b.pool, "UGT-01");
    expect(b.calls[0].sql).toContain("parent_code = ?");
    expect(b.calls[0].params).toEqual(["UGT-01"]);

    // 注意：纯空白 trim 后为空 ⇒ 走 L1 大类层（路由层会先拦非法形参，这里测服务层宽容度）
    for (const bad of ["72", "UGT-G-11", "UGT-C-41", "' OR 1=1--"]) {
      const c = fakePool([]);
      expect(await listCommodityTreeOptions(c.pool, bad)).toEqual([]);
      expect(c.calls).toHaveLength(0); // 脏值不下库，避免误放宽
    }
  });
});

describe("listChildrenOfNode（中类 → 小类 → 子类 → 品目）", () => {
  it("子级走 parent_code 等值，不出现 LEFT(...) 函数包裹（索引可用）", async () => {
    const { pool, calls } = fakePool([L3_ROW]);
    const options = await listChildrenOfNode(pool, "UGT-0101");
    expect(options[0].key).toBe("UGT-010101");
    expect(calls[0].sql).toContain("parent_code = ?");
    expect(calls[0].sql).not.toContain("LEFT(");
    assertNoLegacyTree(calls);
  });

  it("品目层（10 位）无下级：空返回且不发 SQL", async () => {
    const { pool, calls } = fakePool([L5_ROW]);
    expect(await listChildrenOfNode(pool, "UGT-0101010101")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("选项只暴露 key/nameZh/nameEn，不再带同值的 code 字段", async () => {
    const { pool } = fakePool([L3_ROW]);
    const [first] = await listChildrenOfNode(pool, "UGT-0101");
    expect(Object.keys(first).sort()).toEqual(["key", "nameEn", "nameZh"]);
    expect(first.nameEn).toBe(""); // 库里缺英文名就透传空，展示侧兜底，不在此处编
  });
});

describe("resolveCommodityCodeToPath — 偏好节点码 → 路径名称 + 所属大类（L1 码）", () => {
  it("空码与非法码都不问库", async () => {
    const { pool, calls } = fakePool([]);
    expect(await resolveCommodityCodeToPath(pool, null)).toEqual({ l1Code: null, options: [] });
    expect(await resolveCommodityCodeToPath(pool, "")).toEqual({ l1Code: null, options: [] });
    expect(await resolveCommodityCodeToPath(pool, "721015")).toEqual({ l1Code: null, options: [] });
    expect(await resolveCommodityCodeToPath(pool, "UGT-0101011")).toEqual({ l1Code: null, options: [] }); // 奇数位
    expect(calls).toHaveLength(0);
  });

  it("祖先链由码截断得出，各级名称一条 code IN 补齐；大类码=链首位，零额外查库", async () => {
    const { pool, calls } = fakePool([L2_ROW, L5_ROW]);
    const r = await resolveCommodityCodeToPath(pool, "UGT-0101010101");
    expect(r.l1Code).toBe("UGT-01");
    // 树里查无的祖先不编造：只回显库里有名字的两层
    expect(r.options.map((o: { key: string }) => o.key)).toEqual(["UGT-0101", "UGT-0101010101"]);
    const inCall = calls.find((c) => c.sql.includes("code IN"));
    expect(inCall?.params).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]);
    expect(calls).toHaveLength(1); // 只有一条 code IN，G 码时代的大类点查已随切片推导消失
    assertNoLegacyTree(calls);
    expect(calls.join(" ")).not.toContain(LEGACY_DICT_TABLE);
  });

  it("树里查无此码的偏好不编造选项", async () => {
    const { pool, calls } = fakePool([]);
    const r = await resolveCommodityCodeToPath(pool, "UGT-0101010101");
    expect(r.options).toEqual([]);
    assertNoLegacyTree(calls);
  });
});
