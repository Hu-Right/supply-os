/**
 * _INTL 通用键折回（classifyBuyerGroup）：国家级 _INTL 键必须折回无国家参数下的通用键，
 * 否则宽表/服务表的 buyer_group 与内存缓存、Meilisearch filter 对不上。
 * 通过 mock type-store 的 DB 规则路径构造「带国家命中 _INTL、不带国家命中通用键」的场景。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/agency/type-store", () => ({
  loadAgencyTypeRules: async () => {},
  getAgencyTypeRules: () => [
    { typeKey: "AGENCY_INTL", countryCode: "BR", regex: /space agency/i, priority: 0, i18n: {} },
    { typeKey: "AGENCY_GLOBAL", countryCode: null, regex: /global space agency/i, priority: 1, i18n: {} },
  ],
  getAgencyTypeAssignment: () => null,
  clearAgencyTypeCache: () => {},
}));

import { normalizeBuyerCountry, classifyBuyerGroup } from "@/lib/services/notice-normalize/notice-core";
import type { CountryAliasSnapshot, CountryAliasEntry } from "@/lib/services/country/alias-store";

const CN: CountryAliasSnapshot = {
  byKey: new Map<string, CountryAliasEntry>([
    ["BRASIL", { canonical: "Brazil", code: "BR", kind: "country", zh: "" }],
  ]),
  formsByCanonical: new Map([["Brazil", ["BRASIL"]]]),
};

describe("classifyBuyerGroup · _INTL 折回", () => {
  it("带国家命中国家级 _INTL 规则时，折回无国家的通用键", () => {
    const core = normalizeBuyerCountry(
      { agencyFull: "National Global Space Agency", country: "Brasil" },
      new Map(), CN,
    );
    expect(core.buyerGroup).toBe("AGENCY_GLOBAL");
  });

  it("无通用键可折回时保留 _INTL 键（不因折回丢分类）", () => {
    expect(classifyBuyerGroup("National Space Agency", "Brazil")).toBe("AGENCY_INTL");
  });
});
