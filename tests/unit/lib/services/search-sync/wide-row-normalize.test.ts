/**
 * buildWideRow 归一化分支（决定搜索筛选与排序的可取值）
 *
 * 这些分支静默决定 country_std / agency_std / agency_group / notice_type_std /
 * deadline_sec / estimated_value 的落库值，进而决定筛选能否命中与金额排序是否正确。
 */
import { describe, it, expect } from "vitest";
import { buildWideRow } from "@/lib/services/search-sync/wide-row-builder";
import type { CountryAliasSnapshot, CountryAliasEntry } from "@/lib/services/country/alias-store";

/** 与 store 同口径（clean 后大写去重音）构造最小国家表快照 */
function csnap(pairs: Array<[string, { canonical: string; zh?: string }]>): CountryAliasSnapshot {
  const byKey = new Map<string, CountryAliasEntry>();
  const forms = new Map<string, string[]>();
  for (const [alias, e] of pairs) {
    const key = alias.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    byKey.set(key, { canonical: e.canonical, code: null, kind: "country", zh: e.zh ?? "" });
    const arr = forms.get(e.canonical) ?? [];
    arr.push(key);
    forms.set(e.canonical, arr);
  }
  return { byKey, formsByCanonical: forms };
}
const CN = csnap([
  ["Brasil", { canonical: "Brazil", zh: "巴西" }],
  ["RUS", { canonical: "Russia", zh: "俄罗斯" }],
  ["巴西", { canonical: "Brazil", zh: "巴西" }],
  ["China", { canonical: "China", zh: "中国" }],
  ["中国", { canonical: "China", zh: "中国" }],
]);

const base = {
  id: 1, notice_id: "N1", title: "T", reference: "R", description: "D",
  country: "China", agency: "", notice_type: "RFQ", deadline_sec: 100,
  is_featured: 0, estimated_value: 0, entry_source: "crawl",
  documents: null, procurement_files: null, published_date: "2026-09-20",
  description_cn: null, bid_overview: null, beneficiary_countries: null,
};

describe("country_std / agency_std", () => {
  it("国家名归一化为英文标准名（多种历史写法，一切以表为准）", () => {
    for (const [raw, expected] of [["Brasil", "Brazil"], ["RUS", "Russia"], ["巴西", "Brazil"]] as const) {
      expect(buildWideRow({ ...base, country: raw }, new Map(), undefined, undefined, CN).country_std).toBe(expected);
    }
  });

  it("空国家与空机构 → 空串，且不触发机构分类（agency_group 为空）", () => {
    const row = buildWideRow({ ...base, country: "", agency: "" }, new Map());
    expect(row.country_std).toBe("");
    expect(row.agency_std).toBe("");
    expect(row.agency_group).toBe("");
  });

  it("机构别名表命中则用 canonical，未命中则保留原名", () => {
    const alias = new Map([["UNDP", "United Nations Development Programme"]]);
    expect(buildWideRow({ ...base, agency: "undp" }, alias).agency_std)
      .toBe("United Nations Development Programme");
    expect(buildWideRow({ ...base, agency: "Some Local Bureau" }, alias).agency_std)
      .toBe("Some Local Bureau");
  });

  it("受援助国逐个归一并转中文，超长结果按 300 截断", () => {
    const row = buildWideRow({ ...base, beneficiary_countries: "RUS, 中国 , Unknownland" }, new Map(), undefined, undefined, CN);
    expect(row.beneficiary_countries).toContain("俄罗斯");
    expect(row.beneficiary_countries).toContain("中国");
    const long = buildWideRow({ ...base, beneficiary_countries: "RUS,".repeat(80) }, new Map(), undefined, undefined, CN);
    expect(long.beneficiary_countries.length).toBeLessThanOrEqual(300);
  });
});

describe("notice_type_std / deadline_sec / estimated_value", () => {
  it("自然语言类型归一为标准短码", () => {
    expect(buildWideRow({ ...base, notice_type: "Request for Quotation" }, new Map()).notice_type_std).toBe("RFQ");
    expect(buildWideRow({ ...base, notice_type: null }, new Map()).notice_type_std).toBe("OTHER");
  });

  it("deadline_sec 的异常值一律归零（NaN / 负数 / null）", () => {
    expect(buildWideRow({ ...base, deadline_sec: -5 }, new Map()).deadline_sec).toBe(0);
    expect(buildWideRow({ ...base, deadline_sec: "abc" }, new Map()).deadline_sec).toBe(0);
    expect(buildWideRow({ ...base, deadline_sec: null }, new Map()).deadline_sec).toBe(0);
    expect(buildWideRow({ ...base, deadline_sec: "2000000000" }, new Map()).deadline_sec).toBe(2000000000);
  });

  it("金额从含币种与千分位的字符串提取数值", () => {
    expect(buildWideRow({ ...base, estimated_value: "USD 14,000" }, new Map()).estimated_value).toBe(14000);
    expect(buildWideRow({ ...base, estimated_value: "免费" }, new Map()).estimated_value).toBe(0);
    expect(buildWideRow({ ...base, estimated_value: null }, new Map()).estimated_value).toBe(0);
  });

  it("entry_source 缺失时默认 crawl（平台/爬虫归属不得留空）", () => {
    expect(buildWideRow({ ...base, entry_source: null }, new Map()).entry_source).toBe("crawl");
    expect(buildWideRow({ ...base, entry_source: "platform" }, new Map()).entry_source).toBe("platform");
  });

  it("无品目归属时 backbone_path 落 NULL（空串在门禁 BB7 里算违规）", () => {
    const row = buildWideRow(base, new Map());
    expect(row.backbone_path).toBeNull();
    expect(row.documents_count).toBe(0);
  });

  it("有归属时只落 backbone_path，旧口径分类列一个都不产出", () => {
    const row = buildWideRow(base, new Map(), { backbone: "UGT-01,UGT-0101" });
    expect(row.backbone_path).toBe("UGT-01,UGT-0101");
    // 按列族拦截（旧五级 + precise 镜像同族）：改名复活一样报错
    for (const key of Object.keys(row)) expect(key).not.toMatch(/^\w*level[1-5]$/);
  });

  it("结构化文档列计入 documents_count（解锁后是否有拆解件的可筛依据）", () => {
    const row = buildWideRow({
      ...base,
      documents: JSON.stringify([{ name: "TOR.pdf", url: "https://x/TOR.pdf" }]),
    }, new Map());
    expect(row.documents_count).toBeGreaterThan(0);
  });

  it("有机构无国家（或反之）时不做类型聚合，agency_group 保持空", () => {
    const alias = new Map([["UNDP", "United Nations Development Programme"]]);
    expect(buildWideRow({ ...base, agency: "undp", country: "" }, alias).agency_group).toBe("");
    expect(buildWideRow({ ...base, agency: "", country: "Kenya" }, alias).agency_group).toBe("");
  });

  it("空串类型与 null 同样归入 OTHER（筛选短码集合不得出现空值）", () => {
    expect(buildWideRow({ ...base, notice_type: "" }, new Map()).notice_type_std).toBe("OTHER");
  });

  it("已为数值/数组的输入不得被重复解析或误归零", () => {
    const row = buildWideRow({
      ...base,
      estimated_value: 5000.5,
      documents: [{ name: "a.pdf", url: "https://x/a.pdf" }],
      procurement_files: [{ name: "b.pdf", url: "https://x/b.pdf" }],
      is_featured: 1,
    }, new Map());
    expect(row.estimated_value).toBe(5000.5);
    expect(row.is_featured).toBe(1);
    expect(row.documents_count).toBe(2);
  });
});
