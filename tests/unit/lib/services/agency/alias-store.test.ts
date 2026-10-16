/**
 * 机构别名共享 store 单测：归一键、缓存复用、TTL、失败降级、限频 warn、JSON 容错。
 * 模块级缓存跨用例存活 → 每个用例前用 __reset 清态。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import {
  loadAgencyAliasSnapshot, invalidateAgencyAliasCache, normalizeAliasKey, __resetAgencyAliasStoreForTest,
} from "@/lib/services/agency/alias-store";

function makePool(byKeyword: Array<[RegExp, unknown[][]]>, alsoThrow?: RegExp) {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql);
    if (alsoThrow && alsoThrow.test(s)) throw new Error("db down");
    for (const [re, batches] of byKeyword) if (re.test(s)) return [batches.shift() ?? []];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

beforeEach(() => __resetAgencyAliasStoreForTest());

describe("normalizeAliasKey", () => {
  it("trim + 大写归一", () => {
    expect(normalizeAliasKey("  undp ")).toBe("UNDP");
    expect(normalizeAliasKey(null)).toBe("");
  });
});

describe("loadAgencyAliasSnapshot", () => {
  it("成功构建 alias→{canonical,i18n}，key 归一，name_i18n JSON 解析", async () => {
    const { pool } = makePool([[
      /crm_agency_aliases/, [[
        { canonical: "UNDP", alias: "  united nations development programme ", name_i18n: '{"zh":"联合国开发计划署"}' },
        { canonical: "WHO", alias: "who", name_i18n: null },
      ]],
    ]]);
    const snap = await loadAgencyAliasSnapshot(pool);
    expect(snap.byAlias.get("UNITED NATIONS DEVELOPMENT PROGRAMME")).toEqual({
      canonical: "UNDP", i18n: { zh: "联合国开发计划署" },
    });
    expect(snap.byAlias.get("WHO")).toEqual({ canonical: "WHO", i18n: null });
  });

  it("第二次调用命中缓存，不再查库", async () => {
    const { pool, query } = makePool([[/crm_agency_aliases/, [[{ canonical: "X", alias: "y", name_i18n: null }]]]]);
    await loadAgencyAliasSnapshot(pool);
    const before = query.mock.calls.length;
    await loadAgencyAliasSnapshot(pool);
    expect(query.mock.calls.length).toBe(before);
  });

  it("查库失败且无缓存 → 返回空快照 + 告警（不抛）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool } = makePool([], /crm_agency_aliases/);
      const snap = await loadAgencyAliasSnapshot(pool);
      expect(snap.byAlias.size).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("JSON 解析失败 → 该条 i18n 置 null 且告警，不中断整表加载", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool } = makePool([[
        /crm_agency_aliases/, [[
          { canonical: "BAD", alias: "bad", name_i18n: "{不是合法json" },
          { canonical: "GOOD", alias: "good", name_i18n: '{"zh":"好"}' },
        ]],
      ]]);
      const snap = await loadAgencyAliasSnapshot(pool);
      expect(snap.byAlias.get("BAD")?.i18n).toBeNull();
      expect(snap.byAlias.get("GOOD")?.i18n).toEqual({ zh: "好" });
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("canonical 为空的行被跳过；invalidate 生效", async () => {
    const { pool } = makePool([[
      /crm_agency_aliases/, [[
        { canonical: "", alias: "noop", name_i18n: null },
        { canonical: "K", alias: "k", name_i18n: null },
      ]],
    ]]);
    const snap = await loadAgencyAliasSnapshot(pool);
    expect(snap.byAlias.has("NOOP")).toBe(false);
    expect(snap.byAlias.has("K")).toBe(true);
    invalidateAgencyAliasCache();
    // 失效后再次加载应重新查库
    const { pool: p2, query } = makePool([[/crm_agency_aliases/, [[{ canonical: "Z", alias: "z", name_i18n: null }]]]]);
    const snap2 = await loadAgencyAliasSnapshot(p2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(snap2.byAlias.get("Z")?.canonical).toBe("Z");
  });
});
