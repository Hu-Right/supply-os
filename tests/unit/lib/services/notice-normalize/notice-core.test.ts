/**
 * notice-core（买家/国家/机构类型共享归一化）纯函数分支。
 * type-store 未装载 ⇒ classifyAgencyType 走代码内静态规则兜底，本文件全部走该路径。
 */
import { describe, it, expect } from "vitest";
import { normalizeBuyerCountry } from "@/lib/services/notice-normalize/notice-core";
import type { CountryAliasSnapshot, CountryAliasEntry } from "@/lib/services/country/alias-store";

function csnap(pairs: Array<[string, { canonical: string; code?: string | null }]>): CountryAliasSnapshot {
  const byKey = new Map<string, CountryAliasEntry>();
  const forms = new Map<string, string[]>();
  for (const [alias, e] of pairs) {
    const key = alias.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    byKey.set(key, { canonical: e.canonical, code: e.code ?? null, kind: "country", zh: "" });
    const arr = forms.get(e.canonical) ?? [];
    arr.push(key);
    forms.set(e.canonical, arr);
  }
  return { byKey, formsByCanonical: forms };
}
const CN = csnap([
  ["Brasil", { canonical: "Brazil", code: "BR" }],
  ["China", { canonical: "China", code: "CN" }],
  ["United States", { canonical: "United States", code: "US" }],
]);

describe("normalizeBuyerCountry · 买家", () => {
  it("别名表命中取 canonical，未命中保留原名", () => {
    const aliases = new Map([["ACME WORKS", "Acme Works Ltd."]]);
    expect(normalizeBuyerCountry({ agencyFull: "acme works", country: "China" }, aliases, CN).buyerName)
      .toBe("Acme Works Ltd.");
    expect(normalizeBuyerCountry({ agencyFull: "Some Local Bureau", country: "China" }, aliases, CN).buyerName)
      .toBe("Some Local Bureau");
  });

  it("占位平台名剔除为 null（宽表与服务表同款口径）", () => {
    const core = normalizeBuyerCountry({ agency: "SAM", country: "China" }, new Map(), CN);
    expect(core.buyerName).toBeNull();
    expect(core.buyerGroup).toBeNull();
  });

  it("agency_full 优先于 agency（platform 码不是真买家）", () => {
    const core = normalizeBuyerCountry({ agency: "PLATFORM_CODE", agencyFull: "Real Buyer Co", country: "" }, new Map());
    expect(core.buyerName).toBe("Real Buyer Co");
  });

  it("平台占位名回退 organization 首段（真实采购单位藏在层级串里）", () => {
    const core = normalizeBuyerCountry({
      agency: "eprocure_gov_in",
      agencyFull: "eprocure_gov_in",
      organization: "Delhi Development Authority||CE-South Zone-DDA||EE-SWD-5-Sarita Vihar-DDA",
      country: "India",
    }, new Map());
    expect(core.buyerName).toBe("Delhi Development Authority");
  });
});

describe("normalizeBuyerCountry · 国家", () => {
  it("表驱动归一出标准名与 ISO2 码", () => {
    const core = normalizeBuyerCountry({ agencyFull: "X", country: "Brasil" }, new Map(), CN);
    expect(core.countryName).toBe("Brazil");
    expect(core.countryCode).toBe("BR");
    expect(core.countryCodes).toEqual(["BR"]);
  });

  it("多国串拆段去重保序；非 ISO2 形制的引用被剔除", () => {
    const core = normalizeBuyerCountry({ agencyFull: "X", country: "Brasil, China" }, new Map(), CN);
    expect(core.countryCodes).toEqual(["BR", "CN"]);
    const noCode = normalizeBuyerCountry(
      { agencyFull: "X", country: "Brasil" },
      new Map(),
      csnap([["Brasil", { canonical: "Brazil", code: null }]]),
    );
    expect(noCode.countryName).toBe("Brazil");
    expect(noCode.countryCodes).toEqual([]);
    expect(noCode.countryCode).toBeNull();
  });

  it("无快照时国家全空，买家照常归一", () => {
    const core = normalizeBuyerCountry({ agencyFull: "Some Bureau", country: "Brasil" }, new Map());
    expect(core.countryName).toBeNull();
    expect(core.countryCode).toBeNull();
    expect(core.buyerName).toBe("Some Bureau");
  });
});

describe("normalizeBuyerCountry · 机构类型（静态规则兜底路径）", () => {
  it("买家的机构名+国家交给 classifyAgencyType，产出通用 typeKey", () => {
    const core = normalizeBuyerCountry(
      { agencyFull: "UNIVERSIDADE FEDERAL DE SANTA MARIA", country: "Brasil" },
      new Map(), CN,
    );
    expect(core.buyerGroup).toBe("UNIVERSITY_BR");
  });

  it("有买家无国家（或反之）不分类，buyerGroup 为 null", () => {
    expect(normalizeBuyerCountry({ agencyFull: "UNIVERSIDADE X", country: "" }, new Map()).buyerGroup).toBeNull();
    expect(normalizeBuyerCountry({ agencyFull: "", country: "Brasil" }, new Map(), CN).buyerGroup).toBeNull();
  });

  it("占位判定作用于别名解析后的 canonical：原名像占位但别名映射到真名则放行，canonical 本身是占位则剔除", () => {
    // 别名表把平台码映射到真实机构 = 运维有意修正，放行
    const rescued = normalizeBuyerCountry(
      { agencyFull: "SAM", country: "Brasil" },
      new Map([["SAM", "Secretaria de Administracao"]]), CN,
    );
    expect(rescued.buyerName).toBe("Secretaria de Administracao");
    // canonical 本身是占位平台名 → 仍剔除
    const stillPlaceholder = normalizeBuyerCountry(
      { agencyFull: "SAM", country: "Brasil" },
      new Map([["SAM", "E-Procurement Portal"]]), CN,
    );
    expect(stillPlaceholder.buyerName).toBeNull();
    expect(stillPlaceholder.buyerGroup).toBeNull();
  });
});
