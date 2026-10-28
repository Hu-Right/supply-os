/**
 * buildWideRow 投影分支（决定搜索筛选与排序的可取值）
 *
 * 2026-10-27 管道翻转后 buildWideRow 是纯投影：归一化字段（买家/类型分组/国家/金额/截止）
 * 从服务表 notice_public 的 SELECT 别名直拷，本层不做任何归一化计算——归一化语义
 * 的测试归 notice-normalize/notice-core 与 notice-public/build。这里钉的是投影搬运与
 * 检索专有字段（受援国展示形 / entry_source / backbone / 文档计数 / 指纹透传）。
 */
import { describe, it, expect } from "vitest";
import { buildWideRow } from "@/lib/services/search-sync/wide-row-builder";
import type { CountryAliasSnapshot, CountryAliasEntry } from "@/lib/services/country/alias-store";

/** 与 store 同口径（clean 后大写去重音）构造最小国家表快照（受援国展示形仍在②算） */
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
  ["RUS", { canonical: "Russia", zh: "俄罗斯" }],
  ["中国", { canonical: "China", zh: "中国" }],
]);

const base = {
  id: 1, notice_id: "N1", title: "T", reference: "R", description: "D",
  country: "China", agency: "", notice_type: "RFQ", deadline_sec: 100,
  is_featured: 0, estimated_value: 0, entry_source: "crawl",
  documents: null, procurement_files: null, published_date: "2026-09-20",
  description_cn: null, bid_overview: null, beneficiary_countries: null,
};

/** ①归一层带出的归一化字段（SELECT 别名形态） */
const publicHit = {
  buyer_name: "Acme Works Ltd.",
  buyer_group: "PUBLIC_ENTERPRISE_INTL",
  country_name: "Brazil",
  public_country_codes: '["BR","CN"]',
  notice_type_code: "RFQ",
  deadline_ts: 1800000000,
  public_estimated_value: "14000.00",
  public_updated_at: 1760000000,
};

describe("归一化字段投影（服务表 → 宽表）", () => {
  it("买家/类型分组/国家直拷自服务表别名", () => {
    const row = buildWideRow({ ...base, ...publicHit });
    expect(row.buyer_name).toBe("Acme Works Ltd.");
    expect(row.buyer_group).toBe("PUBLIC_ENTERPRISE_INTL");
    expect(row.country_name).toBe("Brazil");
    expect(row.notice_type_code).toBe("RFQ");
  });

  it("country_codes 由 JSON 数组投影为逗号串并保序去重", () => {
    const row = buildWideRow({ ...base, ...publicHit, public_country_codes: '["BR","CN","BR","X"]' });
    expect(row.country_codes).toBe("BR,CN");
  });

  it("①未命中（LEFT JOIN 空 / JSON 损坏）时归一化字段全空，不臆测", () => {
    const miss = buildWideRow({ ...base });
    expect(miss.buyer_name).toBe("");
    expect(miss.buyer_group).toBe("");
    expect(miss.country_name).toBe("");
    expect(miss.country_codes).toBe("");
    expect(miss.notice_type_code).toBe("");
    const broken = buildWideRow({ ...base, ...publicHit, public_country_codes: "{oops" });
    expect(broken.country_codes).toBe("");
  });

  it("截止投影自 deadline_ts：异常值（NaN/负/缺失）一律归零", () => {
    expect(buildWideRow({ ...base, ...publicHit }).deadline_sec).toBe(1800000000);
    expect(buildWideRow({ ...base, deadline_ts: "abc" }).deadline_sec).toBe(0);
    expect(buildWideRow({ ...base, deadline_ts: -5 }).deadline_sec).toBe(0);
    expect(buildWideRow({ ...base }).deadline_sec).toBe(0);
  });

  it("金额投影自服务表归一值：DECIMAL 字符串转数值，缺失/畸形/保密置空落 0", () => {
    expect(buildWideRow({ ...base, ...publicHit }).estimated_value).toBe(14000);
    expect(buildWideRow({ ...base }).estimated_value).toBe(0);
    expect(buildWideRow({ ...base, public_estimated_value: null }).estimated_value).toBe(0);
    expect(buildWideRow({ ...base, public_estimated_value: "oops" }).estimated_value).toBe(0);
  });

  it("有买家无国家（或反之）在 ① 已折算：② 只搬运不补算，buyer_group 缺就是空", () => {
    const row = buildWideRow({ ...base, ...publicHit, buyer_group: null, buyer_name: "Acme Works Ltd." });
    expect(row.buyer_name).toBe("Acme Works Ltd.");
    expect(row.buyer_group).toBe("");
  });
});

describe("检索专有字段（②自产）", () => {
  it("受援助国逐个归一并转中文，超长结果按 300 截断", () => {
    const row = buildWideRow({ ...base, beneficiary_countries: "RUS, 中国 , Unknownland" }, undefined, undefined, CN);
    expect(row.beneficiary_countries).toContain("俄罗斯");
    expect(row.beneficiary_countries).toContain("中国");
    const long = buildWideRow({ ...base, beneficiary_countries: "RUS,".repeat(80) }, undefined, undefined, CN);
    expect(long.beneficiary_countries.length).toBeLessThanOrEqual(300);
  });

  it("entry_source 缺失时默认 crawl（平台/爬虫归属不得留空）", () => {
    expect(buildWideRow({ ...base, entry_source: null }).entry_source).toBe("crawl");
    expect(buildWideRow({ ...base, entry_source: "platform" }).entry_source).toBe("platform");
  });

  it("无品目归属时 backbone_path 落 NULL（空串在门禁 BB7 里算违规）", () => {
    const row = buildWideRow(base);
    expect(row.backbone_path).toBeNull();
    expect(row.documents_count).toBe(0);
  });

  it("有归属时只落 backbone_path，旧口径分类列一个都不产出", () => {
    const row = buildWideRow(base, { backbone: "UGT-01,UGT-0101" });
    expect(row.backbone_path).toBe("UGT-01,UGT-0101");
    for (const key of Object.keys(row)) expect(key).not.toMatch(/^\w*level[1-5]$/);
  });

  it("结构化文档列计入 documents_count（解锁后是否有拆解件的可筛依据）", () => {
    const row = buildWideRow({
      ...base,
      documents: JSON.stringify([{ name: "TOR.pdf", url: "https://x/TOR.pdf" }]),
    });
    expect(row.documents_count).toBeGreaterThan(0);
  });

  it("已为数值/数组的输入不得被重复解析或误归零", () => {
    const row = buildWideRow({
      ...base,
      documents: [{ name: "a.pdf", url: "https://x/a.pdf" }],
      procurement_files: [{ name: "b.pdf", url: "https://x/b.pdf" }],
      is_featured: 1,
    });
    expect(row.is_featured).toBe(1);
    expect(row.documents_count).toBe(2);
  });

  it("主表原始归一输入（agency/country/notice_type/estimated_value/deadline_sec）不再进任何产出列", () => {
    const row = buildWideRow({ ...base, agency: "undp", country: "Brasil", notice_type: "RFQ" });
    expect(row).not.toHaveProperty("agency");
    expect(row).not.toHaveProperty("country");
    expect(row).not.toHaveProperty("estimated_value_raw");
    // 归一化语义的守卫已上移：宽表构建器不再引用 notice-core / normalizeAmount
    expect(row.buyer_group).toBe("");
  });
});
