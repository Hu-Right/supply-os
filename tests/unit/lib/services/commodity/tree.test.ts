/**
 * 品目骨架树读层单测
 *
 * 换树之后最容易被做错的两件事，这里一起钉住：
 * 1. **筛选键就是骨架节点码**（`UGT-…`），与公告侧 `backbone_path` 同口径。一旦有人把旧的
 *    旧品类码 数字前缀拿回来当键，界面照常渲染、筛出来却是空集（`backbone_path` 里没有那种 token），
 *    且不报错 —— 所以键形制与 SQL 一起钉。
 * 2. **不得回读旧树**：所有 SQL 只准命中 `crm_commodity_backbone` /
 *    `旧品类字典表`（旧字典只作身份翻译）。出现 `crm_commodity_nodes` 就是回退，用例直接红；
 *    出现已退役的大类维表族（`crm_commodity_group*`）同样是回退 —— 段归属已改为从骨架推导（ADR-0009）。
 * 另钉一条实测事实：大类码不能由节点码切片推出（32 个 L1 行只有 5 行的码序号等于大类码序号），
 * 所以取大类必须发生一次点查。
 */
import { describe, expect, it } from "vitest";
import {
  commodityNodeChain,
  commodityNodeLevel,
  isCommodityNodeKey,
  listChildrenOfNode,
  listCommodityTreeOptions,
  listL2OfGroup,
  resolveCommodityCodeToPath,
  resolveGroupCodeOfNode,
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

const L2_ROW = { code: "UGT-0101", name_zh: "建筑施工服务", name_en: "" };
const L3_ROW = { code: "UGT-010101", name_zh: "施工服务", name_en: "" };
const L5_ROW = { code: "UGT-0101010101", name_zh: "干洗厂施工和改建服务", name_en: "Dry cleaning construction" };

describe("isCommodityNodeKey / commodityNodeLevel", () => {
  it("只认 UGT- 前缀 + 偶数位（2/4/6/8/10）", () => {
    for (const ok of ["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]) {
      expect(isCommodityNodeKey(ok)).toBe(true);
    }
    for (const bad of ["72", "721015", "UGT-1", "UGT-010", "UGT-", "", "  UGT-01", "UGT-C-41", "UGT-010101010101"]) {
      expect(isCommodityNodeKey(bad)).toBe(false);
    }
  });

  it("位数就是层级；非法键返回 0（不猜层级）", () => {
    expect(commodityNodeLevel("UGT-01")).toBe(1);
    expect(commodityNodeLevel("UGT-010101")).toBe(3);
    expect(commodityNodeLevel("UGT-0101010101")).toBe(5);
    expect(commodityNodeLevel("721015")).toBe(0);
  });
});

describe("commodityNodeChain — 祖先链由码自身截断", () => {
  it("小类码 → 五级链前三个点亮，后两层空串", () => {
    expect(commodityNodeChain("UGT-010101")).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "", ""]);
  });

  it("品目码 → 五级全点亮", () => {
    expect(commodityNodeChain("UGT-0101010101")).toEqual([
      "UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101",
    ]);
  });

  it("非法值返回全空：宁可不点亮，也不拿错键去筛", () => {
    expect(commodityNodeChain("721015")).toEqual(["", "", "", "", ""]);
    expect(commodityNodeChain(null)).toEqual(["", "", "", "", ""]);
  });
});

describe("listL2OfGroup（大类 → 中类）", () => {
  it("常量外的大类码直接空返回，连库都不问", async () => {
    const { pool, calls } = fakePool([]);
    expect(await listL2OfGroup(pool, "UGT-G-99")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("先按 group_code 点查 L1，再取子级；返回的 key 就是节点码", async () => {
    const { pool, calls } = fakePool((sql) =>
      sql.includes("group_code = ?") ? [{ code: "UGT-01" }] : [L2_ROW],
    );
    const options = await listL2OfGroup(pool, "UGT-G-11");
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain("level = 1");
    expect(calls[0].params).toEqual(["UGT-G-11"]);
    expect(calls[1].sql).toContain("parent_code = ?");
    expect(calls[1].params).toEqual(["UGT-01"]); // 点查得到的 L1 码，不是拿大类码拼出来的
    expect(options[0].key).toBe("UGT-0101");
    assertNoLegacyTree(calls);
  });

  it("L1 行不存在时不编造子级", async () => {
    const { pool } = fakePool([]);
    expect(await listL2OfGroup(pool, "UGT-G-11")).toEqual([]);
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

describe("listCommodityTreeOptions — 分派入口", () => {
  it("大类码走大类分支，节点码走子级分支，脏值一律空返回", async () => {
    const a = fakePool((sql) => (sql.includes("group_code = ?") ? [{ code: "UGT-01" }] : [L2_ROW]));
    await listCommodityTreeOptions(a.pool, "UGT-G-11");
    expect(a.calls[0].sql).toContain("level = 1");

    const b = fakePool([L3_ROW]);
    await listCommodityTreeOptions(b.pool, "UGT-0101");
    expect(b.calls[0].sql).toContain("parent_code = ?");

    for (const bad of ["", "   ", "72", "UGT-C-41", "' OR 1=1--"]) {
      const c = fakePool([]);
      expect(await listCommodityTreeOptions(c.pool, bad)).toEqual([]);
      expect(c.calls).toHaveLength(0); // 脏值不下库，避免误放宽
    }
  });
});

describe("resolveGroupCodeOfNode — 大类码必须点查（切片推不出来）", () => {
  it("用链顶 L1 码按 code 等值查 group_code", async () => {
    const { pool, calls } = fakePool([{ group_code: "UGT-G-11" }]);
    expect(await resolveGroupCodeOfNode(pool, "UGT-010101")).toBe("UGT-G-11");
    expect(calls[0].sql).toContain("WHERE code = ?");
    expect(calls[0].params).toEqual(["UGT-01"]); // 截到链顶，而不是整串传下去
    assertNoLegacyTree(calls);
  });

  it("非法键返回 null；查得到码但 group_code 为空串也返回 null（不给界面假值）", async () => {
    const a = fakePool([{ group_code: "UGT-G-11" }]);
    expect(await resolveGroupCodeOfNode(a.pool, "721015")).toBeNull();
    const b = fakePool([{ group_code: "" }]);
    expect(await resolveGroupCodeOfNode(b.pool, "UGT-01")).toBeNull();
  });
});

describe("resolveCommodityCodeToPath — 偏好节点码 → 路径名称 + 大类码", () => {
  it("空码与非法码都不问库", async () => {
    const { pool, calls } = fakePool([]);
    expect(await resolveCommodityCodeToPath(pool, null)).toEqual({ groupCode: null, options: [] });
    expect(await resolveCommodityCodeToPath(pool, "")).toEqual({ groupCode: null, options: [] });
    expect(await resolveCommodityCodeToPath(pool, "721015")).toEqual({ groupCode: null, options: [] });
    expect(await resolveCommodityCodeToPath(pool, "UGT-0101011")).toEqual({ groupCode: null, options: [] }); // 奇数位
    expect(calls).toHaveLength(0);
  });

  it("祖先链由码截断得出，各级名称一条 code IN 补齐，大类码点查", async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes("code IN")) return [L2_ROW, L5_ROW];
      return [{ group_code: "UGT-G-11" }];
    });
    const r = await resolveCommodityCodeToPath(pool, "UGT-0101010101");
    expect(r.groupCode).toBe("UGT-G-11");
    expect(r.options.map((o: { key: string }) => o.key)).toEqual(["UGT-0101", "UGT-0101010101"]);
    const inCall = calls.find((c) => c.sql.includes("code IN"));
    expect(inCall?.params).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]);
    assertNoLegacyTree(calls);
    expect(calls.join(" ")).not.toContain("crm_unspsc_codes");
  });

  it("树里查无此码的偏好不编造选项；status=0 的行同样剔除", async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes("code IN")) return [];
      return [{ group_code: "UGT-G-11" }];
    });
    const r = await resolveCommodityCodeToPath(pool, "UGT-0101010101");
    expect(r.options).toEqual([]);
    assertNoLegacyTree(calls);
  });
});
