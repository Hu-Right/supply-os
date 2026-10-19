/**
 * 国家归一服务层解析器单测（纯表驱动，无静态兜底）：整串命中 / 多国拆段 / region 取舍 / 未解析回填。
 */
import { describe, it, expect } from "vitest";
import { resolveCountries, countryCodesOf, countryCanonicalsOf } from "@/lib/services/country/resolve";
import type { CountryAliasSnapshot, CountryAliasEntry, CountryKind } from "@/lib/services/country/alias-store";

function snap(pairs: Array<[string, Partial<Pick<CountryAliasEntry, "canonical" | "code" | "kind">>]>): CountryAliasSnapshot {
  const byKey = new Map<string, CountryAliasEntry>();
  const forms = new Map<string, string[]>();
  for (const [alias, e] of pairs) {
    const key = alias.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const entry: CountryAliasEntry = {
      canonical: e.canonical ?? alias.trim(),
      code: e.code ?? null,
      kind: (e.kind as CountryKind) ?? "country",
      zh: "",
    };
    byKey.set(key, entry);
    const arr = forms.get(entry.canonical) ?? [];
    arr.push(key);
    forms.set(entry.canonical, arr);
  }
  return { byKey, formsByCanonical: forms };
}

describe("resolveCountries · 整串命中", () => {
  it("已入表的合法逗号单国不误拆（Canada, British Columbia → Canada）", () => {
    const s = snap([["Canada, British Columbia", { canonical: "Canada", code: "ca" }]]);
    const r = resolveCountries("Canada, British Columbia", s);
    expect(countryCanonicalsOf(r)).toEqual(["Canada"]);
    expect(r.unresolved).toBe("");
  });
  it("region 命中返回引用但不算可筛国家", () => {
    const s = snap([["Asia", { canonical: "Asia", kind: "region" }]]);
    const r = resolveCountries("Asia", s);
    expect(r.refs[0]?.kind).toBe("region");
    expect(countryCodesOf(r)).toEqual([]);
  });
});

describe("resolveCountries · 多国拆段", () => {
  it("首段即可识别的多国串也能拆（Benin, Nigeria → 两国）", () => {
    const s = snap([
      ["Benin", { canonical: "Benin", code: "bj" }],
      ["Nigeria", { canonical: "Nigeria", code: "ng" }],
    ]);
    const r = resolveCountries("Benin, Nigeria", s);
    expect(countryCodesOf(r).sort()).toEqual(["BJ", "NG"]);
    expect(r.unresolved).toBe("");
  });
});

describe("resolveCountries · 表不完善", () => {
  it("表里查不到 → unresolved 回填（不静默吞、不兜底）", () => {
    const s = snap([["Brazil", { canonical: "Brazil", code: "br" }]]);
    const r = resolveCountries("Neverlandia", s);
    expect(r.refs).toHaveLength(0);
    expect(r.unresolved).toBe("Neverlandia");
  });
});
