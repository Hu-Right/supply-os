/**
 * formatItems 机构 i18n 三级回退覆盖（架构评估 P0-T1 续）
 *
 * 覆盖：缓存精确匹配 → agency_group 聚合键回退 → translateByPattern.i18n
 * 优先 → classifyAgencyType 计算回退。mock 全部外源，按用例注入行为。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAgencyCacheData: vi.fn(),
  classifyAgencyType: vi.fn(),
  translateByPattern: vi.fn(),
}));

vi.mock("../notice-search/agencies/index", () => ({
  getAgencyCacheData: mocks.getAgencyCacheData,
}));
vi.mock("../agency/index", () => ({
  classifyAgencyType: mocks.classifyAgencyType,
}));
vi.mock("../../data/agency-i18n/translate", () => ({
  translateByPattern: mocks.translateByPattern,
}));

import { formatItems } from "./format";

const row = (over: Record<string, unknown> = {}) =>
  ({ agency: "TEST", breakdown_file_count: 0, is_featured: 0, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgencyCacheData.mockReturnValue([]);
  mocks.translateByPattern.mockReturnValue(null);
  mocks.classifyAgencyType.mockReturnValue(null);
});

describe("formatItems — 机构 i18n 三级回退", () => {
  it("缓存精确匹配（agency 大写键）→ 注入 agency_i18n", () => {
    mocks.getAgencyCacheData.mockReturnValue([
      { agency: "unicef", i18n: { zh: "联合国儿童基金会", en: "UNICEF" } },
    ]);
    const items = formatItems([row({ agency: "UNICEF" })], "zh");
    expect(items[0].agency_i18n).toBe("联合国儿童基金会");
  });

  it("缓存未命中 → agency_group 聚合键回退", () => {
    mocks.getAgencyCacheData.mockReturnValue([
      { agency: "MUNICIPIO_BR", i18n: { zh: "巴西市政机构" } },
    ]);
    const items = formatItems([row({ agency: "CAMARA_SP", agency_group: "MUNICIPIO_BR" })], "zh");
    expect(items[0].agency_i18n).toBe("巴西市政机构");
  });

  it("缓存与聚合键均未命中 → translateByPattern.i18n 优先（精确缩写）", () => {
    mocks.translateByPattern.mockReturnValue({ i18n: { zh: "伊斯兰开发银行" } });
    const items = formatItems([row({ agency: "ISDB_GLOBAL", country: "SA" })], "zh");
    expect(mocks.translateByPattern).toHaveBeenCalledWith("ISDB_GLOBAL");
    expect(items[0].agency_i18n).toBe("伊斯兰开发银行");
    expect(mocks.classifyAgencyType).not.toHaveBeenCalled();
  });

  it("translateByPattern 无 i18n → classifyAgencyType 计算回退（用 canonical 名）", () => {
    mocks.translateByPattern.mockReturnValue({ canonical: "MINISTERIO DA SAUDE" });
    mocks.classifyAgencyType.mockReturnValue({ i18n: { zh: "卫生部" } });
    const items = formatItems([row({ agency: "MIN. DA SAUDE", country: "BR" })], "zh");
    expect(mocks.classifyAgencyType).toHaveBeenCalledWith("MINISTERIO DA SAUDE", "BR");
    expect(items[0].agency_i18n).toBe("卫生部");
  });

  it("全部回退均未命中 → agency_i18n 为 undefined", () => {
    const items = formatItems([row({ agency: "UNKNOWN ORG" })], "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });
});
