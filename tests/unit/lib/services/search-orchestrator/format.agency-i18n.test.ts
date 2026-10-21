/**
 * formatItems 机构 i18n 三级回退覆盖（架构评估 P0-T1 续）
 *
 * 覆盖：缓存精确匹配 → buyer_group 聚合键回退 → translateByPattern.i18n
 * 优先 → classifyAgencyType 计算回退。mock 全部外源，按用例注入行为。
 *
 * 2026-10-21 服务表切换：读侧字段名一律跟服务表原字段（buyer_name / buyer_group /
 * country_code），不再走宽表的 agency / agency_group / country 别名。
 * ⚠ 下拉缓存条目（getAgencyCacheData 的返回）仍以 `agency` 为键名 —— 那是下拉 API
 *   自己的形状，不是公告行字段，两者别混。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAgencyCacheData: vi.fn(),
  classifyAgencyType: vi.fn(),
  translateByPattern: vi.fn(),
}));

vi.mock("@/lib/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: mocks.getAgencyCacheData,
}));
vi.mock("@/lib/services/agency/index", () => ({
  classifyAgencyType: mocks.classifyAgencyType,
}));
vi.mock("@/lib/data/agency-i18n/translate", () => ({
  translateByPattern: mocks.translateByPattern,
}));

import { formatItems } from "@/lib/services/search-orchestrator/format";
import { enrichAgencyI18n } from "@/lib/services/search-orchestrator/format";

const row = (over: Record<string, unknown> = {}) =>
  ({ buyer_name: "TEST", is_featured: 0, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgencyCacheData.mockReturnValue([]);
  mocks.translateByPattern.mockReturnValue(null);
  mocks.classifyAgencyType.mockReturnValue(null);
});

describe("formatItems — 机构 i18n 三级回退", () => {
  it("缓存精确匹配（buyer_name 大写键）→ 注入 agency_i18n", () => {
    mocks.getAgencyCacheData.mockReturnValue([
      { agency: "unicef", i18n: { zh: "联合国儿童基金会", en: "UNICEF" } },
    ]);
    const items = formatItems([row({ buyer_name: "UNICEF" })], "zh");
    expect(items[0].agency_i18n).toBe("联合国儿童基金会");
  });

  it("缓存未命中 → buyer_group 聚合键回退", () => {
    mocks.getAgencyCacheData.mockReturnValue([
      { agency: "MUNICIPIO_BR", i18n: { zh: "巴西市政机构" } },
    ]);
    const items = formatItems([row({ buyer_name: "CAMARA_SP", buyer_group: "MUNICIPIO_BR" })], "zh");
    expect(items[0].agency_i18n).toBe("巴西市政机构");
  });

  it("缓存与聚合键均未命中 → translateByPattern.i18n 优先（精确缩写）", () => {
    mocks.translateByPattern.mockReturnValue({ i18n: { zh: "伊斯兰开发银行" } });
    const items = formatItems([row({ buyer_name: "ISDB_GLOBAL", country_code: "SA" })], "zh");
    expect(mocks.translateByPattern).toHaveBeenCalledWith("ISDB_GLOBAL");
    expect(items[0].agency_i18n).toBe("伊斯兰开发银行");
    expect(mocks.classifyAgencyType).not.toHaveBeenCalled();
  });

  it("translateByPattern 无 i18n → classifyAgencyType 计算回退（用 canonical 名 + 服务表国家码）", () => {
    mocks.translateByPattern.mockReturnValue({ canonical: "MINISTERIO DA SAUDE" });
    mocks.classifyAgencyType.mockReturnValue({ i18n: { zh: "卫生部" } });
    const items = formatItems([row({ buyer_name: "MIN. DA SAUDE", country_code: "BR" })], "zh");
    expect(mocks.classifyAgencyType).toHaveBeenCalledWith("MINISTERIO DA SAUDE", "BR");
    expect(items[0].agency_i18n).toBe("卫生部");
  });

  it("country_code 缺失时不传国家（聚合回退不得拿 undefined 当国家码）", () => {
    mocks.translateByPattern.mockReturnValue({ canonical: "SOME AGENCY" });
    mocks.classifyAgencyType.mockReturnValue(null);
    formatItems([row({ buyer_name: "SOME AGENCY" })], "zh");
    expect(mocks.classifyAgencyType).toHaveBeenCalledWith("SOME AGENCY", undefined);
  });

  it("全部回退均未命中 → agency_i18n 为 undefined", () => {
    const items = formatItems([row({ buyer_name: "UNKNOWN ORG" })], "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });
});

describe("enrichAgencyI18n — 推荐管道共享助手（2026-10-12 推荐列表露码修复）", () => {
  it("与 formatItems 同口径：缓存精确 → 聚合键 → 计算回退逐级生效", () => {
    mocks.getAgencyCacheData.mockReturnValue([
      { agency: "unicef", i18n: { zh: "联合国儿童基金会" } },
      { agency: "MUNICIPIO_BR", i18n: { zh: "巴西各市政府" } },
    ]);
    mocks.translateByPattern.mockImplementation((name: string) =>
      name === "mercadopublico_cl" ? { canonical: "Mercado Público", i18n: { zh: "智利公共采购网" } } : null,
    );
    const [a, b, c] = enrichAgencyI18n(
      [
        { buyer_name: "UNICEF", country_code: "GL" },
        { buyer_name: "CAMARA_SP", buyer_group: "MUNICIPIO_BR", country_code: "BR" },
        { buyer_name: "mercadopublico_cl", country_code: "CL" },
      ] as Array<Record<string, unknown>>,
      "zh",
    );
    expect(a.agency_i18n).toBe("联合国儿童基金会");
    expect(b.agency_i18n).toBe("巴西各市政府");
    expect(c.agency_i18n).toBe("智利公共采购网");
  });

  it("原地修改并返回同一数组，buyer_name 原值不被改写（过滤器按原值匹配）", () => {
    const items = [{ buyer_name: "mercadopublico_cl", country_code: "CL" }] as Array<Record<string, unknown>>;
    mocks.translateByPattern.mockReturnValue({ canonical: "Mercado Público", i18n: { zh: "智利公共采购网" } });
    const out = enrichAgencyI18n(items, "zh");
    expect(out).toBe(items);
    expect(items[0].buyer_name).toBe("mercadopublico_cl");
    expect(items[0].agency_i18n).toBe("智利公共采购网");
  });

  it("无 buyer_name 的行不报错，agency_i18n 为 undefined", () => {
    const items = enrichAgencyI18n([{ buyer_name: null, country_code: "BR" }] as Array<Record<string, unknown>>, "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });

  it("旧宽表别名行（只有 agency）不再被识别：口径唯一，不留向后兼容", () => {
    // 服务表切换的红线：读侧只认 buyer_name。若有人想「两个名字都读」做兼容，
    // 本用例先红——兼容分支会静默吞掉列名漂移，下次改名就查不出来。
    mocks.getAgencyCacheData.mockReturnValue([{ agency: "unicef", i18n: { zh: "联合国儿童基金会" } }]);
    const items = enrichAgencyI18n([{ agency: "UNICEF" }] as Array<Record<string, unknown>>, "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });
});
