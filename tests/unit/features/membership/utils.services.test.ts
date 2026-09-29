import { describe, it, expect } from "vitest";
import { resolveServiceBranch, serviceDisplayName, groupServicesByCategory, pickServiceTabGroups } from "@/features/membership/utils";
import type { ServiceCatalogRow } from "@/types/membership";

const row = (over: Partial<ServiceCatalogRow>): ServiceCatalogRow => ({
  service_code: "svc_x", category: "pro_service", name_zh: "中文", name_en: "EN",
  price_mode: "per_unit", standard_price: null, price_from: 0, currency: "CNY",
  sale_mode: "self", member_discount: "none", credit_to_annual_plan: 0,
  deliverable_note_zh: null, sort_order: 1, ...over,
});

describe("resolveServiceBranch", () => {
  it("self + 有固定价 → pay", () => expect(resolveServiceBranch(row({ standard_price: "199.00" }))).toBe("pay"));
  // 260928 报价表把这些商品写成「按需报价 / 定制报价 / 面议」，目录 sale_mode=contract：
  // 即便目录里存了参考起价，也不许出现自助支付按钮（与 service-payment 闸口同口径）。
  it("contract 但有价 → consult（预约顾问，不得自助成交）", () =>
    expect(resolveServiceBranch(row({ standard_price: "9800.00", price_mode: "contact", sale_mode: "contract" }))).toBe("consult"));
  it("lead 有价 → consult", () => expect(resolveServiceBranch(row({ standard_price: "500.00", sale_mode: "lead" }))).toBe("consult"));
  it("self 无价 → consult", () => expect(resolveServiceBranch(row({ standard_price: null }))).toBe("consult"));
  // 报价表写成「500元~3,000元/单」「1,280 元起/1 个方向」的行：标价只是起点，
  // 按它直接收款会把应谈的价格少掉，所以一律走预约顾问（与服务端闸口同一条不变量）。
  it("self 有价但起点价（price_from=1）→ consult", () =>
    expect(resolveServiceBranch(row({ standard_price: "500.00", price_from: 1 }))).toBe("consult"));
  it("self 0 价 → consult", () => expect(resolveServiceBranch(row({ standard_price: "0.00" }))).toBe("consult"));
});

describe("serviceDisplayName", () => {
  it("zh 取 name_zh", () => expect(serviceDisplayName(row({}), "zh")).toBe("中文"));
  it("zh-CN 取 name_zh", () => expect(serviceDisplayName(row({}), "zh-CN")).toBe("中文"));
  it("非 zh 取 name_en", () => expect(serviceDisplayName(row({}), "en")).toBe("EN"));
});

describe("groupServicesByCategory", () => {
  it("按 260928 报价表板块顺序分组（顾问 → 专业增值 → API）并丢弃空组", () => {
    const g = groupServicesByCategory([
      row({ category: "api_license" }), row({ category: "pro_service" }), row({ category: "advisory" }),
    ]);
    expect(Object.keys(g)).toEqual(["advisory", "pro_service", "api_license"]);
    expect(g.pro_service).toHaveLength(1);
  });
});

describe("pickServiceTabGroups", () => {
  it("三类全放（文档在售的 12 行服务都必须能点到）", () => {
    const g = groupServicesByCategory([
      row({ service_code: "svc_ka_service", category: "advisory" }),
      row({ service_code: "svc_intel_report", category: "pro_service" }),
      row({ service_code: "svc_api_data_license", category: "api_license" }),
    ]);
    expect(Object.keys(pickServiceTabGroups(g)).sort()).toEqual(["advisory", "api_license", "pro_service"]);
  });
  it("已在企业 Tab 以档位卡呈现的服务从服务 Tab 剔除（同一商品不重复上架）", () => {
    const g = groupServicesByCategory([
      row({ service_code: "svc_manual_bid_match", category: "pro_service" }),
      row({ service_code: "svc_intel_report", category: "pro_service" }),
    ]);
    const picked = pickServiceTabGroups(g);
    expect(picked.pro_service).toHaveLength(1);
    expect(picked.pro_service[0].service_code).toBe("svc_intel_report");
  });
  it("剔除后整组为空则丢弃该组", () => {
    const picked = pickServiceTabGroups({ pro_service: [row({ service_code: "svc_manual_bid_match", category: "pro_service" })] });
    expect(Object.keys(picked)).toHaveLength(0);
  });
  it("显式传排除列表时以传入为准", () => {
    const g = groupServicesByCategory([
      row({ service_code: "svc_manual_bid_match", category: "pro_service" }),
      row({ service_code: "svc_intel_report", category: "pro_service" }),
    ]);
    const picked = pickServiceTabGroups(g, ["svc_intel_report"]);
    expect(picked.pro_service.map((r) => r.service_code)).toEqual(["svc_manual_bid_match"]);
  });
});
