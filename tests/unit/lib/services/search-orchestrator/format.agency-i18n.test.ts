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
  getNoticeAgencies: vi.fn(),
  ensureAgencyDisplaySnapshot: vi.fn(),
  classifyAgencyType: vi.fn(),
  translateByPattern: vi.fn(),
  countryZhOf: vi.fn(),
}));

vi.mock("@/lib/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: mocks.getAgencyCacheData,
  getNoticeAgencies: mocks.getNoticeAgencies,
}));
// 只钉住预热入口（用部分 mock，保留 resolveAgencyDisplay 真实行为，上面所有回退链用例靠它）
vi.mock("@/lib/services/agency/resolve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/agency/resolve")>()),
  ensureAgencyDisplaySnapshot: mocks.ensureAgencyDisplaySnapshot,
}));
vi.mock("@/lib/services/agency/index", () => ({
  classifyAgencyType: mocks.classifyAgencyType,
}));
vi.mock("@/lib/data/agency-i18n/translate", () => ({
  translateByPattern: mocks.translateByPattern,
}));
vi.mock("@/lib/services/country/display", () => ({
  countryZhOf: mocks.countryZhOf,
}));

import { formatItems } from "@/lib/services/search-orchestrator/format";
import { enrichAgencyI18n } from "@/lib/services/search-orchestrator/format";
import { ensureAgencyI18nWarmup, ensureAgencyDisplayWarmup } from "@/lib/services/search-orchestrator/format";
// 部分 mock 保留了真实 resolveAgencyDisplay，这两个入口用来注入/归零别名表快照
import { __setAgencyDisplaySnapshotForTest } from "@/lib/services/agency/resolve";
import { normalizeAliasKey } from "@/lib/services/agency/alias-store";

const row = (over: Record<string, unknown> = {}) =>
  ({ buyer_name: "TEST", is_featured: 0, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  // 别名表快照默认置空：上面的回退链用例都走「表未命中 → 模式合成」那条路
  __setAgencyDisplaySnapshotForTest(null);
  mocks.getAgencyCacheData.mockReturnValue([]);
  mocks.getNoticeAgencies.mockResolvedValue([]);
  mocks.ensureAgencyDisplaySnapshot.mockResolvedValue(undefined);
  mocks.translateByPattern.mockReturnValue(null);
  mocks.classifyAgencyType.mockReturnValue(null);
  mocks.countryZhOf.mockReturnValue(null);
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

  it("[统一中文 2026-10-28] 精确解析的含汉字 zh 胜过缓存聚合桶的通用修复标签", () => {
    // 缓存优先的旧序会让「黑山各机构」遮住别名表精名「黑山临床中心」
    mocks.getAgencyCacheData.mockReturnValue([{ agency: "KCCG", i18n: { zh: "黑山各机构" } }]);
    mocks.translateByPattern.mockReturnValue({ canonical: "KCCG", i18n: { zh: "黑山临床中心" } });
    const items = formatItems([row({ buyer_name: "KCCG", country_code: "ME" })], "zh");
    expect(items[0].agency_i18n).toBe("黑山临床中心");
  });

  it("[统一中文 2026-10-28] 纯透传（zh 无汉字）不算翻译：露码原文仍由缓存修复标签兜底", () => {
    mocks.getAgencyCacheData.mockReturnValue([{ agency: "mercadopublico_cl", i18n: { zh: "政府采购系统" } }]);
    mocks.translateByPattern.mockReturnValue({ canonical: "mercadopublico_cl", i18n: { zh: "mercadopublico_cl" } });
    const items = formatItems([row({ buyer_name: "mercadopublico_cl", country_code: "CL" })], "zh");
    expect(items[0].agency_i18n).toBe("政府采购系统");
  });

  it("[统一中文 2026-10-28] 透传且类型桶/缓存均未接住 → 国家级「XX各机构」zh 终兜底", () => {
    mocks.countryZhOf.mockReturnValue("日本");
    const items = formatItems([row({ buyer_name: "Aomori", country_code: "JP" })], "zh");
    expect(items[0].agency_i18n).toBe("日本各机构");
  });

  it("country_code 缺省时回退 country_codes 首码（推荐管道行只有宽表逗号列）", () => {
    mocks.classifyAgencyType.mockReturnValue({ i18n: { zh: "日本各研究所" } });
    mocks.translateByPattern.mockReturnValue({ canonical: "OME INSTITUTE" });
    formatItems([row({ buyer_name: "OME", country_codes: "JP,US" })], "zh");
    expect(mocks.classifyAgencyType).toHaveBeenCalledWith("OME INSTITUTE", "JP");
  });

  it("country_code/codes 皆缺 → 回退主表 n.country 英文名（推荐行国家上下文末位）", () => {
    mocks.countryZhOf.mockImplementation((s: string) => (s === "Japan" ? "日本" : null));
    const items = formatItems([row({ buyer_name: "Aomori", country: "Japan" })], "zh");
    expect(items[0].agency_i18n).toBe("日本各机构");
  });

  it("非 zh 不做国家终兜底（外文原文是 en 等语言的合法展示）", () => {
    mocks.countryZhOf.mockReturnValue("日本");
    const items = formatItems([row({ buyer_name: "Aomori", country_code: "JP" })], "en");
    expect(items[0].agency_i18n).toBeUndefined();
  });
});

describe("formatItems — 来源字段裁剪（2026-10-28 用户口径：来源平台解锁后才可见）", () => {
  it("列表载荷剔除 source_url / platform_name，锁定详情合成不再泄漏原文外链", () => {
    const items = formatItems(
      [row({ buyer_name: "UNICEF", source_url: "https://example.org/t/1", platform_name: "example" })],
      "zh",
    );
    expect(items[0].source_url).toBeUndefined();
    expect(items[0].platform_name).toBeUndefined();
    expect(items[0].buyer_name).toBe("UNICEF");
  });
});

/**
 * [详情分层 2026-10-29] registeredOnly：详情只认**别名表登记名**。
 * 真库探针实录两点：① 近 3000 行取样的 buyer_name 几乎全部落到国家级聚合桶
 * （「法国各机构」）；② 剩下能拿到「精名」的也只占取样机构的 5.3%，而且形态是
 * "LAND REGISTRATION管理局" 这种「整串原文 + 末尾类型词译中」的机械拼接。
 * 前端详情取值链是 `agencyI18n || buyerName`，两者都会盖掉真实买家名——
 * 列表/预览仍用默认链（不露外文原文），详情传 registeredOnly。
 */
describe("enrichAgencyI18n — registeredOnly（详情侧不接聚合桶与合成名）", () => {
  it("国家级终兜底不接：同一行默认链得「日本各机构」，registeredOnly 得 undefined", () => {
    mocks.countryZhOf.mockReturnValue("日本");
    const [byDefault] = enrichAgencyI18n([{ buyer_name: "Aomori", country_code: "JP" }] as Array<Record<string, unknown>>, "zh");
    const [registered] = enrichAgencyI18n([{ buyer_name: "Aomori", country_code: "JP" }] as Array<Record<string, unknown>>, "zh", { registeredOnly: true });
    expect(byDefault.agency_i18n).toBe("日本各机构");
    expect(registered.agency_i18n).toBeUndefined();
  });

  it("类型聚合桶与下拉缓存都不接", () => {
    mocks.classifyAgencyType.mockReturnValue({ typeKey: "X", i18n: { zh: "巴西各市联合体" } });
    mocks.getAgencyCacheData.mockReturnValue([{ agency: "UNICEF", i18n: { zh: "联合国儿童基金会" } }]);
    const items = enrichAgencyI18n(
      [{ buyer_name: "OME", country_code: "BR" }, { buyer_name: "UNICEF" }] as Array<Record<string, unknown>>,
      "zh",
      { registeredOnly: true },
    );
    expect(items[0].agency_i18n).toBeUndefined();
    expect(items[1].agency_i18n).toBeUndefined();
  });

  it("模式合成名（i18nFrom=pattern）不接：详情宁用真名，列表仍保留它", () => {
    // 没有别名表登记时，resolveAgencyDisplay 的 i18n 完全由 translateByPattern 合成
    mocks.translateByPattern.mockReturnValue({ canonical: "LAND REGISTRATION AUTHORITY", i18n: { zh: "LAND REGISTRATION管理局" } });
    const [registered] = enrichAgencyI18n(
      [{ buyer_name: "LAND REGISTRATION AUTHORITY", country_code: "PH" }] as Array<Record<string, unknown>>,
      "zh",
      { registeredOnly: true },
    );
    expect(registered.agency_i18n).toBeUndefined();
    // 列表/预览侧这个合成名仍胜得过国家级桶名，所以默认链保留
    const [byDefault] = enrichAgencyI18n(
      [{ buyer_name: "LAND REGISTRATION AUTHORITY", country_code: "PH" }] as Array<Record<string, unknown>>,
      "zh",
    );
    expect(byDefault.agency_i18n).toBe("LAND REGISTRATION管理局");
  });

  it("只认别名表登记名（表内有多语名才下发）", () => {
    __setAgencyDisplaySnapshotForTest({
      byAlias: new Map([[normalizeAliasKey("KCCG"), { canonical: "KCCG", i18n: { zh: "黑山临床中心" } }]]),
    });
    const items = enrichAgencyI18n(
      [{ buyer_name: "kccg", country_code: "ME" }] as Array<Record<string, unknown>>,
      "zh",
      { registeredOnly: true },
    );
    expect(items[0].agency_i18n).toBe("黑山临床中心");
  });

  it("纯透传（zh 无汉字）仍不算翻译，也不会退而去取聚合桶", () => {
    mocks.translateByPattern.mockReturnValue({ canonical: "mercadopublico_cl", i18n: { zh: "mercadopublico_cl" } });
    mocks.getAgencyCacheData.mockReturnValue([{ agency: "mercadopublico_cl", i18n: { zh: "政府采购系统" } }]);
    const items = enrichAgencyI18n(
      [{ buyer_name: "mercadopublico_cl", country_code: "CL" }] as Array<Record<string, unknown>>,
      "zh",
      { registeredOnly: true },
    );
    expect(items[0].agency_i18n).toBeUndefined();
  });
});

/**
 * [2026-10-29] 预热不得把出口拖住。主管道侧实测冷缓存时 getNoticeAgencies 可达 20s+，
 * 同步 await 会把单条公告的详情/预览拖过前端超时（同 _searchCore 里「total 有值但
 * items 为空」那一类事故），所以详情只等别名表快照，预览的聚合预热发了就不管。
 */
describe("ensureAgency*Warmup — 聚合缓存不阻塞出口", () => {
  it("详情用的 ensureAgencyDisplayWarmup 只等别名表，不碰聚合缓存", async () => {
    await ensureAgencyDisplayWarmup({} as never);
    expect(mocks.ensureAgencyDisplaySnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.getNoticeAgencies).not.toHaveBeenCalled();
  });

  it("聚合查询挂住不返回时，ensureAgencyI18nWarmup 仍然立即完成", async () => {
    mocks.getAgencyCacheData.mockReturnValue(null);
    let released = false;
    mocks.getNoticeAgencies.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(() => { released = true; resolve(); }, 200)),
    );
    const t0 = Date.now();
    await ensureAgencyI18nWarmup({} as never);
    expect(Date.now() - t0).toBeLessThan(100);
    expect(released).toBe(false);
  });

  it("聚合缓存已热（getAgencyCacheData 有值）→ 根本不重拉", async () => {
    mocks.getAgencyCacheData.mockReturnValue([{ agency: "X", i18n: { zh: "Y" } }]);
    await ensureAgencyI18nWarmup({} as never);
    expect(mocks.getNoticeAgencies).not.toHaveBeenCalled();
  });

  it("别名表预热报错也不能让出口挂掉（预热失败只是少一层翻译）", async () => {
    mocks.ensureAgencyDisplaySnapshot.mockRejectedValue(new Error("boom"));
    await expect(ensureAgencyI18nWarmup({} as never)).resolves.toBeUndefined();
  });
});
