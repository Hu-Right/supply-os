import { describe, it, expect } from "vitest";
import { resolveServiceBranch, serviceDisplayName, groupServicesByCategory, pickServiceTabGroups } from "@/features/membership/utils";
import type { ServiceCatalogRow } from "@/types/membership";

const row = (over: Partial<ServiceCatalogRow>): ServiceCatalogRow => ({
  service_code: "svc_x", category: "pro_service", name_zh: "中文", name_en: "EN",
  price_mode: "per_unit", standard_price: null, price_from: 0, currency: "CNY",
  sale_mode: "self", member_discount: "none", deliverable_note_zh: null, sort_order: 1, ...over,
});

describe("resolveServiceBranch", () => {
  it("有固定价 → pay", () => expect(resolveServiceBranch(row({ standard_price: "199.00" }))).toBe("pay"));
  it("contact 但有价 → pay", () => expect(resolveServiceBranch(row({ standard_price: "9800.00", price_mode: "contact" }))).toBe("pay"));
  it("无价 → consult", () => expect(resolveServiceBranch(row({ standard_price: null }))).toBe("consult"));
  it("0 价 → consult", () => expect(resolveServiceBranch(row({ standard_price: "0.00" }))).toBe("consult"));
});

describe("serviceDisplayName", () => {
  it("zh 取 name_zh", () => expect(serviceDisplayName(row({}), "zh")).toBe("中文"));
  it("zh-CN 取 name_zh", () => expect(serviceDisplayName(row({}), "zh-CN")).toBe("中文"));
  it("非 zh 取 name_en", () => expect(serviceDisplayName(row({}), "en")).toBe("EN"));
});

describe("groupServicesByCategory", () => {
  it("按 category 分组并保序、丢弃空组", () => {
    const g = groupServicesByCategory([
      row({ category: "advisory" }), row({ category: "pro_service" }), row({ category: "api_license" }),
    ]);
    expect(Object.keys(g)).toEqual(["pro_service", "advisory", "api_license"]);
    expect(g.pro_service).toHaveLength(1);
  });
});

describe("pickServiceTabGroups", () => {
  it("只保留 advisory + api_license，丢弃 pro_service", () => {
    const g = groupServicesByCategory([
      row({ category: "advisory" }), row({ category: "pro_service" }), row({ category: "api_license" }),
    ]);
    const picked = pickServiceTabGroups(g);
    expect(Object.keys(picked).sort()).toEqual(["advisory", "api_license"]);
    expect(picked.pro_service).toBeUndefined();
  });
  it("无允许类别时返回空对象", () => {
    const picked = pickServiceTabGroups({ pro_service: [row({ category: "pro_service" })] });
    expect(Object.keys(picked)).toHaveLength(0);
  });
});
