/**
 * 品目骨架树读层单测
 *
 * 换树之后最容易被做错的两件事，这里一起钉住：
 * 1. **筛选键就是骨架节点码**（`UGT-B-…`），与公告侧 `backbone_path` 同口径。一旦有人把旧的
 *    UNSPSC 数字前缀拿回来当键，界面照常渲染、筛出来却是空集（`backbone_path` 里没有那种 token），
 *    且不报错 —— 所以键形制与 SQL 一起钉。
 * 2. **不得回读旧树**：所有 SQL 只准命中 `crm_commodity_backbone` / `crm_commodity_group_segments` /
 *    `crm_unspsc_codes`（旧字典只作身份翻译）。出现 `crm_commodity_nodes` 就是回退，用例直接红。
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
  resolveGroupCodeOfNode,
  resolveUnspscIdsToCommodityPath,
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

const L2_ROW = { code: "UGT-B-0101", name_zh: "建筑施工服务", name_en: "" };
const L3_ROW = { code: "UGT-B-010101", name_zh: "施工服务", name_en: "" };
const L5_ROW = { code: "UGT-B-0101010101", name_zh: "干洗厂施工和改建服务", name_en: "Dry cleaning construction" };

describe("isCommodityNodeKey / commodityNodeLevel", () => {
  it("只认 UGT-B- 前缀 + 偶数位（2/4/6/8/10）", () => {
    for (const ok of ["UGT-B-01", "UGT-B-0101", "UGT-B-010101", "UGT-B-01010101", "UGT-B-0101010101"]) {
      expect(isCommodityNodeKey(ok)).toBe(true);
    }
    for (const bad of ["72", "721015", "UGT-B-1", "UGT-B-010", "UGT-B-", "", "  UGT-B-01", "UGT-C-41", "UGT-B-010101010101"]) {
      expect(isCommodityNodeKey(bad)).toBe(false);
    }
  });

  it("位数就是层级；非法键返回 0（不猜层级）", () => {
    expect(commodityNodeLevel("UGT-B-01")).toBe(1);
    expect(commodityNodeLevel("UGT-B-010101")).toBe(3);
    expect(commodityNodeLevel("UGT-B-0101010101")).toBe(5);
    expect(commodityNodeLevel("721015")).toBe(0);
  });
});

describe("commodityNodeChain — 祖先链由码自身截断", () => {
  it("小类码 → 五级链前三个点亮，后两层空串", () => {
    expect(commodityNodeChain("UGT-B-010101")).toEqual(["UGT-B-01", "UGT-B-0101", "UGT-B-010101", "", ""]);
  });

  it("品目码 → 五级全点亮", () => {
    expect(commodityNodeChain("UGT-B-0101010101")).toEqual([
      "UGT-B-01", "UGT-B-0101", "UGT-B-010101", "UGT-B-01010101", "UGT-B-0101010101",
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
      sql.includes("group_code = ?") ? [{ code: "UGT-B-01" }] : [L2_ROW],
    );
    const options = await listL2OfGroup(pool, "UGT-G-11");
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain("level = 1");
    expect(calls[0].params).toEqual(["UGT-G-11"]);
    expect(calls[1].sql).toContain("parent_code = ?");
    expect(calls[1].params).toEqual(["UGT-B-01"]); // 点查得到的 L1 码，不是拿大类码拼出来的
    expect(options[0].key).toBe("UGT-B-0101");
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
    const options = await listChildrenOfNode(pool, "UGT-B-0101");
    expect(options[0].key).toBe("UGT-B-010101");
    expect(calls[0].sql).toContain("parent_code = ?");
    expect(calls[0].sql).not.toContain("LEFT(");
    assertNoLegacyTree(calls);
  });

  it("品目层（10 位）无下级：空返回且不发 SQL", async () => {
    const { pool, calls } = fakePool([L5_ROW]);
    expect(await listChildrenOfNode(pool, "UGT-B-0101010101")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("选项只暴露 key/nameZh/nameEn，不再带同值的 code 字段", async () => {
    const { pool } = fakePool([L3_ROW]);
    const [first] = await listChildrenOfNode(pool, "UGT-B-0101");
    expect(Object.keys(first).sort()).toEqual(["key", "nameEn", "nameZh"]);
    expect(first.nameEn).toBe(""); // 库里缺英文名就透传空，展示侧兜底，不在此处编
  });
});

describe("listCommodityTreeOptions — 分派入口", () => {
  it("大类码走大类分支，节点码走子级分支，脏值一律空返回", async () => {
    const a = fakePool((sql) => (sql.includes("group_code = ?") ? [{ code: "UGT-B-01" }] : [L2_ROW]));
    await listCommodityTreeOptions(a.pool, "UGT-G-11");
    expect(a.calls[0].sql).toContain("level = 1");

    const b = fakePool([L3_ROW]);
    await listCommodityTreeOptions(b.pool, "UGT-B-0101");
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
    expect(await resolveGroupCodeOfNode(pool, "UGT-B-010101")).toBe("UGT-G-11");
    expect(calls[0].sql).toContain("WHERE code = ?");
    expect(calls[0].params).toEqual(["UGT-B-01"]); // 截到链顶，而不是整串传下去
    assertNoLegacyTree(calls);
  });

  it("非法键返回 null；查得到码但 group_code 为空串也返回 null（不给界面假值）", async () => {
    const a = fakePool([{ group_code: "UGT-G-11" }]);
    expect(await resolveGroupCodeOfNode(a.pool, "721015")).toBeNull();
    const b = fakePool([{ group_code: "" }]);
    expect(await resolveGroupCodeOfNode(b.pool, "UGT-B-01")).toBeNull();
  });
});

describe("resolveUnspscIdsToCommodityPath — 旧字典 id → 骨架节点", () => {
  it("空 ids 与全 0 ids 都不问库", async () => {
    const { pool, calls } = fakePool([]);
    expect(await resolveUnspscIdsToCommodityPath(pool, [])).toEqual({ groupCode: null, options: [] });
    await resolveUnspscIdsToCommodityPath(pool, [0, null, undefined]);
    expect(calls).toHaveLength(0);
  });

  it("段级字典行 → 大类 L1，并把大类码带出来", async () => {
    const { pool, calls } = fakePool((sql) =>
      sql.includes("crm_unspsc_codes")
        ? [{ id: 100081, code: "72000000", level: 2 }]
        : [{ code: "UGT-B-14", name_zh: "交通运输", name_en: "", group_code: "UGT-G-14" }],
    );
    const r = await resolveUnspscIdsToCommodityPath(pool, [100081]);
    expect(r.groupCode).toBe("UGT-G-14");
    expect(r.options).toEqual([{ key: "UGT-B-14", nameZh: "交通运输", nameEn: "" }]);
    expect(calls[1].sql).toContain("crm_commodity_group_segments"); // 经自己的 32 类归属表
    assertNoLegacyTree(calls);
  });

  it("族级 → 中类 L2（由类行往上两级推），类级 → 子类 L4，品目级 → L5", async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes("crm_unspsc_codes")) {
        return [
          { id: 1, code: "72100000", level: 3 },
          { id: 2, code: "72101500", level: 4 },
          { id: 3, code: "72101510", level: 5 },
        ];
      }
      if (sql.includes("b4.unspsc_prefix LIKE")) return [L2_ROW];
      if (sql.includes("level = ? AND unspsc_prefix = ?")) return [L5_ROW];
      return [];
    });
    const r = await resolveUnspscIdsToCommodityPath(pool, [1, 2, 3]);
    expect(r.options.map((o) => o.key)).toEqual(["UGT-B-0101", "UGT-B-0101010101"]);
    // 类级/品目级都按 unspsc_prefix 等值命中，参数是截好的键（不是整串 8 位）
    const prefixCalls = calls.filter((c) => c.sql.includes("level = ? AND unspsc_prefix = ?"));
    expect(prefixCalls[0].params).toEqual([4, "721015"]); // 类：截 6 位命中 L4
    expect(prefixCalls[1].params).toEqual([5, "72101510"]); // 品目：8 位整串
    assertNoLegacyTree(calls);
  });

  it("字典 level=1（A..J 字母容器）与非 8 位码一律跳过，不做臆测映射", async () => {
    const { pool, calls } = fakePool((sql) =>
      sql.includes("crm_unspsc_codes")
        ? [{ id: 100, code: "A", level: 1 }, { id: 101, code: "ZZZZ", level: 4 }]
        : [{ code: "UGT-B-01", name_zh: "不该被用到", name_en: "", group_code: "UGT-G-11" }],
    );
    const r = await resolveUnspscIdsToCommodityPath(pool, [100, 101]);
    expect(r.options).toEqual([]);
    expect(r.groupCode).toBeNull();
    expect(calls).toHaveLength(1); // 只问了字典，没为新树发第二次查询
  });

  it("字典有、树里换不出节点的码不编造选项", async () => {
    const { pool, calls } = fakePool((sql) =>
      sql.includes("crm_unspsc_codes") ? [{ id: 1, code: "99000000", level: 2 }] : [],
    );
    const r = await resolveUnspscIdsToCommodityPath(pool, [1]);
    expect(r.options).toEqual([]);
    expect(r.groupCode).toBeNull();
    assertNoLegacyTree(calls);
  });
});
