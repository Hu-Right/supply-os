/**
 * buyer/entity-index：机构实体匹配的唯一口径（2026-10-31 机构口径收敛）。
 *
 * 覆盖的静默错误面：
 *  - 归一键（NFKC / 空白折叠 / 大写）不统一 → 同实体匹配不上或同别名重复登记；
 *  - 同国同归一键映射到不同 buyer_id（历史脏数据）→ 必须返回 null（不猜），不能后者覆盖前者；
 *  - 同名跨国（UNDP 等）→ 只有在全局恰好一个实体时才允许无国家回退。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import {
  loadBuyerEntityIndex, resolveBuyerEntity,
  type BuyerEntityIndex,
} from "@/lib/services/buyer/entity-index";
import { normalizeBuyerKey } from "@/lib/services/buyer/normalize";

type Row = {
  alias: string | null;
  country_code: string | null;
  buyer_id: number;
  canonical_name: string | null;
  name_zh: string | null;
  buyer_group: string | null;
};

function makePool(rows: Row[], opts: { throw?: boolean; buyerRows?: Array<Omit<Row, "alias">> } = {}) {
  // 分别响应两次 SELECT：① buyer 实体表（含无别名实体）② buyer_alias ⋈ buyer
  const buyerRows = opts.buyerRows
    ?? [...new Map(rows.map((r) => [r.buyer_id, { ...r }])).values()];
  const query = vi.fn(async (sql: string, _params?: unknown) => {
    if (opts.throw) throw new Error("db down");
    const s = String(sql);
    if (/FROM buyer\s+WHERE status/.test(s)) return [buyerRows];
    expect(s).toMatch(/FROM buyer_alias a\s+JOIN buyer b/);
    return [rows];
  });
  return { pool: { query } as unknown as Pool, query };
}

function row(partial: Partial<Row> & { alias: string; buyer_id: number }): Row {
  return {
    country_code: "BR",
    canonical_name: "Canonical",
    name_zh: "规范名",
    buyer_group: "MUNICIPIO_BR",
    ...partial,
  } as Row;
}

describe("normalizeBuyerKey", () => {
  it("NFKC + 空白折叠 + trim + 大写（全角/换行/双空格收敛为同一键）", () => {
    expect(normalizeBuyerKey("  ＵＮＤＰ ")).toBe("UNDP");
    expect(normalizeBuyerKey("Ministry  of\nHealth")).toBe("MINISTRY OF HEALTH");
    expect(normalizeBuyerKey(null)).toBe("");
  });
});

describe("loadBuyerEntityIndex", () => {
  it("装载失败 → 空索引降级（构建继续，不抛错）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = makePool([], { throw: true });
    try {
      const index = await loadBuyerEntityIndex(pool);
      expect(index.byCountry.size).toBe(0);
      expect(index.byName.size).toBe(0);
      expect(resolveBuyerEntity(index, "Anything", "BR")).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("alias 与 canonical_name 都是命中键；实体按 buyer_id 去重", async () => {
    const { pool } = makePool([
      row({ alias: "PREFEITURA DE X", buyer_id: 7, canonical_name: "Prefeitura de X" }),
      // canonical_name 与 alias 同一实体：byName 不得重复计数
      row({ alias: "Prefeitura de X", buyer_id: 7, canonical_name: "Prefeitura de X" }),
    ]);
    const index = await loadBuyerEntityIndex(pool);
    expect(index.stats.entities).toBe(1);
    expect(index.byName.get("PREFEITURA DE X")?.length).toBe(1);
    expect(resolveBuyerEntity(index, "prefeitura de x", "BR")?.buyerId).toBe(7);
  });

  it("同国同归一键映射到两个实体 → 歧义，但 canonical 命中者可确定性收敛", async () => {
    const { pool } = makePool([
      row({ alias: "DG, BSF, MHA", buyer_id: 1, canonical_name: "DG, BSF, MHA" }),
      row({ alias: "DG,BSF,MHA", buyer_id: 2, canonical_name: "Another Entity" }),
      row({ alias: "DG, BSF, MHA", buyer_id: 2, canonical_name: "Another Entity" }),
    ]);
    const index = await loadBuyerEntityIndex(pool);
    expect(index.stats.ambiguousKeys).toBe(1);
    // 键上的歧义由 canonical_name 命中收敛（1 号的实体名就是该键）
    expect(resolveBuyerEntity(index, "DG, BSF, MHA", "BR")?.buyerId).toBe(1);
  });

  it("同国同名重复实体（历史脏数据）→ 取 buyer_id 最小者，保证确定性", async () => {
    const { pool } = makePool([
      row({ alias: "DUP NAME", buyer_id: 5, canonical_name: "DUP NAME" }),
      row({ alias: "DUP NAME", buyer_id: 3, canonical_name: "DUP NAME" }),
    ]);
    const index = await loadBuyerEntityIndex(pool);
    expect(resolveBuyerEntity(index, "DUP NAME", "BR")?.buyerId).toBe(3);
  });

  it("纯别名撞车（canonical 对不上）→ 仍返回 null（不猜）", async () => {
    const { pool } = makePool([
      row({ alias: "SHARED ALIAS", buyer_id: 1, canonical_name: "Entity One" }),
      row({ alias: "SHARED ALIAS", buyer_id: 2, canonical_name: "Entity Two" }),
    ]);
    const index = await loadBuyerEntityIndex(pool);
    expect(resolveBuyerEntity(index, "SHARED ALIAS", "BR")).toBeNull();
  });

  it("同名跨国（UNDP 多国实体）→ 国家维精确命中；无国家上下文时全局非唯一 → null", async () => {
    const { pool } = makePool([
      row({ alias: "UNDP", buyer_id: 11, country_code: "BR" }),
      row({ alias: "UNDP", buyer_id: 12, country_code: "KE" }),
    ]);
    const index = await loadBuyerEntityIndex(pool);
    expect(resolveBuyerEntity(index, "undp", "BR")?.buyerId).toBe(11);
    expect(resolveBuyerEntity(index, "undp", "KE")?.buyerId).toBe(12);
    expect(resolveBuyerEntity(index, "undp", null)).toBeNull();
  });

  it("国家维未登记但全局唯一 → 唯一回退命中（容忍公告国家缺失/错误码）", async () => {
    const { pool } = makePool([
      row({ alias: "UNIQUE BUREAU", buyer_id: 21, country_code: "BR" }),
    ]);
    const index = await loadBuyerEntityIndex(pool);
    expect(resolveBuyerEntity(index, "Unique Bureau", "CN")?.buyerId).toBe(21);
  });

  it("没有别名行的实体（历史批次直接建档）→ 仍可由 canonical_name 命中", async () => {
    const { pool } = makePool([], {
      buyerRows: [{
        buyer_id: 42, canonical_name: "Lonely Entity", country_code: "ES",
        name_zh: "独体机构", buyer_group: null,
      }],
    });
    const index = await loadBuyerEntityIndex(pool);
    expect(index.stats.entities).toBe(1);
    expect(resolveBuyerEntity(index, "lonely  entity", "ES")?.buyerId).toBe(42);
  });

  it("空名 / 空索引 → null", () => {
    const empty: BuyerEntityIndex = {
      byCountry: new Map(), byName: new Map(), byCanonical: new Map(),
      stats: { aliasRows: 0, entities: 0, ambiguousKeys: 0 },
    };
    expect(resolveBuyerEntity(empty, "   ", "BR")).toBeNull();
    expect(resolveBuyerEntity(empty, "X", "BR")).toBeNull();
  });
});
