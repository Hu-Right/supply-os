/**
 * 国家别名共享 store 单测：归一键去重音、快照构建、缓存复用、失败降级、限频 warn、JSON 容错。
 * 模块级缓存跨用例存活 → 每个用例前用 __reset 清态。镜像 agency/alias-store.test.ts。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

import {
  loadCountryAliasSnapshot,
  invalidateCountryAliasCache,
  normalizeCountryKey,
  __resetCountryAliasStoreForTest,
} from "@/lib/services/country/alias-store";

function makePool(byKeyword: Array<[RegExp, unknown[][]]>, alsoThrow?: RegExp) {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql);
    if (alsoThrow && alsoThrow.test(s)) throw new Error("db down");
    for (const [re, batches] of byKeyword) if (re.test(s)) return [batches.shift() ?? []];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

beforeEach(() => __resetCountryAliasStoreForTest());

describe("normalizeCountryKey", () => {
  it("trim + 大写 + 去重音（与 ai_ci 唯一索引判等一致）", () => {
    expect(normalizeCountryKey("  tÜrkiye ")).toBe("TURKIYE");
    expect(normalizeCountryKey("Côte d'Ivoire")).toBe("COTE D'IVOIRE");
    expect(normalizeCountryKey(null)).toBe("");
  });
});

describe("loadCountryAliasSnapshot", () => {
  it("成功构建 byKey→{canonical,code,kind,zh}，并生成 canonical→forms 反向展开", async () => {
    const { pool } = makePool([[
      /country_aliases/, [[
        { canonical: "Turkey", country_code: "TR", alias: "Türkiye", kind: "country", name_i18n: '{"zh":"土耳其"}' },
        { canonical: "Turkey", country_code: "TR", alias: "Turkey", kind: "country", name_i18n: null },
        { canonical: "Asia", country_code: null, alias: "Asia", kind: "region", name_i18n: '{"zh":"亚洲"}' },
      ]],
    ]]);
    const snap = await loadCountryAliasSnapshot(pool);
    expect(snap.byKey.get("TURKIYE")).toEqual({ canonical: "Turkey", code: "TR", kind: "country", zh: "土耳其" });
    expect(snap.byKey.get("ASIA")).toEqual({ canonical: "Asia", code: null, kind: "region", zh: "亚洲" });
    // 反向：canonical → 其所有归一键（去重音大写），供别名展开
    expect(new Set(snap.formsByCanonical.get("Turkey"))).toEqual(new Set(["TURKIYE", "TURKEY"]));
  });

  it("第二次调用命中缓存，不再查库", async () => {
    const { pool, query } = makePool([[/country_aliases/, [[{ canonical: "X", country_code: null, alias: "x", kind: "country", name_i18n: null }]]]]);
    await loadCountryAliasSnapshot(pool);
    const before = query.mock.calls.length;
    await loadCountryAliasSnapshot(pool);
    expect(query.mock.calls.length).toBe(before);
  });

  it("查库失败且无缓存 → 返回空快照 + 告警（不抛）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool } = makePool([], /country_aliases/);
      const snap = await loadCountryAliasSnapshot(pool);
      expect(snap.byKey.size).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("JSON 解析失败 → 该条 zh 置空且告警，不中断整表加载", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool } = makePool([[
        /country_aliases/, [[
          { canonical: "BAD", country_code: null, alias: "bad", kind: "country", name_i18n: "{不是合法json" },
          { canonical: "GOOD", country_code: "G", alias: "good", kind: "country", name_i18n: '{"zh":"好"}' },
        ]],
      ]]);
      const snap = await loadCountryAliasSnapshot(pool);
      expect(snap.byKey.get("BAD")?.zh).toBe("");
      expect(snap.byKey.get("GOOD")?.zh).toBe("好");
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("canonical 为空的行被跳过；invalidate 生效", async () => {
    const { pool } = makePool([[
      /country_aliases/, [[
        { canonical: "", country_code: null, alias: "noop", kind: "country", name_i18n: null },
        { canonical: "K", country_code: null, alias: "k", kind: "country", name_i18n: null },
      ]],
    ]]);
    const snap = await loadCountryAliasSnapshot(pool);
    expect(snap.byKey.has("NOOP")).toBe(false);
    expect(snap.byKey.has("K")).toBe(true);
    invalidateCountryAliasCache();
    const { pool: p2, query } = makePool([[/country_aliases/, [[{ canonical: "Z", country_code: null, alias: "z", kind: "country", name_i18n: null }]]]]);
    const snap2 = await loadCountryAliasSnapshot(p2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(snap2.byKey.get("Z")?.canonical).toBe("Z");
  });
});
