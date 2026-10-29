/**
 * formatItems / enrichAgencyI18n — 机构 i18n「绝对准确」口径覆盖（2026-10-29）。
 *
 * [绝对准确] 买家字段只认**别名表登记名**（i18nFrom === "alias" 且 zh 含汉字）：
 * · 聚合桶（classify 类型桶 / 下拉缓存桶 / 国家级「XX各机构」）是类别名冒充买家名，全面退役；
 * · 模式合成名（"LAND REGISTRATION管理局"）中英夹生，一并退役；
 * · 无登记名的买家显示真实原名（前端取值链 agencyI18n || buyerName 自然回退），宁缺毋假。
 * mock 全部外源：translateByPattern 注入合成行为，别名表快照按用例注入登记行。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureAgencyDisplaySnapshot: vi.fn(),
  translateByPattern: vi.fn(),
}));

// 只钉住预热入口（部分 mock 保留 resolveAgencyDisplay 真实行为，登记名用例靠它）
vi.mock("@/lib/services/agency/resolve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/agency/resolve")>()),
  ensureAgencyDisplaySnapshot: mocks.ensureAgencyDisplaySnapshot,
}));
vi.mock("@/lib/data/agency-i18n/translate", () => ({
  translateByPattern: mocks.translateByPattern,
}));

import { formatItems, enrichAgencyI18n, ensureAgencyDisplayWarmup } from "@/lib/services/search-orchestrator/format";
// 用来按用例注入/归零别名表快照
import { __setAgencyDisplaySnapshotForTest } from "@/lib/services/agency/resolve";
import { normalizeAliasKey } from "@/lib/services/agency/alias-store";

const row = (over: Record<string, unknown> = {}) =>
  ({ buyer_name: "TEST", is_featured: 0, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  // 别名表快照默认置空：未登记的买家一律显示真实原名
  __setAgencyDisplaySnapshotForTest(null);
  mocks.translateByPattern.mockReturnValue(null);
  mocks.ensureAgencyDisplaySnapshot.mockResolvedValue(undefined);
});

describe("enrichAgencyI18n — 绝对准确口径（只认别名表登记名）", () => {
  it("别名表登记名（zh 含汉字）照下发，匹配大小写不敏感", () => {
    __setAgencyDisplaySnapshotForTest({
      byAlias: new Map([[normalizeAliasKey("KCCG"), { canonical: "KCCG", i18n: { zh: "黑山临床中心" } }]]),
    });
    const items = enrichAgencyI18n([{ buyer_name: "kccg", country_code: "ME" }] as Array<Record<string, unknown>>, "zh");
    expect(items[0].agency_i18n).toBe("黑山临床中心");
  });

  it("模式合成名（i18nFrom=pattern）不接：宁显示真实原名", () => {
    // 没有别名表登记时，resolveAgencyDisplay 的 i18n 完全由 translateByPattern 合成
    mocks.translateByPattern.mockReturnValue({ canonical: "LAND REGISTRATION AUTHORITY", i18n: { zh: "LAND REGISTRATION管理局" } });
    const items = enrichAgencyI18n(
      [{ buyer_name: "LAND REGISTRATION AUTHORITY", country_code: "PH" }] as Array<Record<string, unknown>>,
      "zh",
    );
    expect(items[0].agency_i18n).toBeUndefined();
  });

  it("纯透传（zh 无汉字）不算翻译", () => {
    mocks.translateByPattern.mockReturnValue({ canonical: "mercadopublico_cl", i18n: { zh: "mercadopublico_cl" } });
    const items = enrichAgencyI18n([{ buyer_name: "mercadopublico_cl", country_code: "CL" }] as Array<Record<string, unknown>>, "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });

  it("别名表登记但该行无 zh（走模式补）→ 合成名不算登记名，不下发", () => {
    // 登记行 i18n 为空 → resolveAgencyDisplay 用模式补 zh，但 i18nFrom 变为 "pattern"
    __setAgencyDisplaySnapshotForTest({
      byAlias: new Map([[normalizeAliasKey("OME"), { canonical: "OME INSTITUTE", i18n: null }]]),
    });
    mocks.translateByPattern.mockReturnValue({ canonical: "OME INSTITUTE", i18n: { zh: "OME INSTITUTE研究所" } });
    const items = enrichAgencyI18n([{ buyer_name: "OME", country_code: "JP" }] as Array<Record<string, unknown>>, "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });

  it("无 buyer_name 的行不报错，agency_i18n 为 undefined", () => {
    const items = enrichAgencyI18n([{ buyer_name: null, country_code: "BR" }] as Array<Record<string, unknown>>, "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });

  it("原地修改并返回同一数组，buyer_name 原值不被改写（过滤器按原值匹配）", () => {
    __setAgencyDisplaySnapshotForTest({
      byAlias: new Map([[normalizeAliasKey("KCCG"), { canonical: "KCCG", i18n: { zh: "黑山临床中心" } }]]),
    });
    const items = [{ buyer_name: "KCCG", country_code: "ME" }] as Array<Record<string, unknown>>;
    const out = enrichAgencyI18n(items, "zh");
    expect(out).toBe(items);
    expect(items[0].buyer_name).toBe("KCCG");
    expect(items[0].agency_i18n).toBe("黑山临床中心");
  });
});

describe("formatItems — 列表同口径 + 来源字段裁剪", () => {
  it("列表与详情同口径：登记名下发、无登记名 undefined（前端回退真名）", () => {
    // 国家级「日本各机构」兜底已退役：探针实录该桶会盖掉真实买家名
    mocks.translateByPattern.mockReturnValue({ canonical: "Aomori", i18n: { zh: "Aomori" } });
    const items = formatItems([row({ buyer_name: "Aomori", country_code: "JP" })], "zh");
    expect(items[0].agency_i18n).toBeUndefined();
  });

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

describe("ensureAgencyDisplayWarmup — 预热不阻塞出口", () => {
  it("只等别名表快照，报错也不让出口挂掉（预热失败只是少一层翻译）", async () => {
    mocks.ensureAgencyDisplaySnapshot.mockRejectedValue(new Error("boom"));
    await expect(ensureAgencyDisplayWarmup({} as never)).resolves.toBeUndefined();
  });
});
