/**
 * mapSupplierRow 类型徽章映射测试
 * @module tests/unit/lib/services/suppliers-company-type.test.ts
 * @description 钉住「展示什么 = 搜什么」的类型徽章口径：
 *              1. business_type_code=manufacturer/trader → 卡片显示 工厂/贸易商（与「工厂/贸易商」页签同源）；
 *              2. service_provider / other / 缺码 → companyType 为 undefined（卡片留白），
 *                 绝不允许再出现「中国→工厂、外国→贸易商」的国内外猜测兜底（假数据误导）。
 */
import { describe, it, expect } from "vitest";
import { mapSupplierRow } from "@/lib/services/suppliers";
import type { SupplierDirectoryRow } from "@/lib/repos/suppliers";

function row(over: Partial<SupplierDirectoryRow> = {}): SupplierDirectoryRow {
  return {
    id: 1,
    company: "杭州某某机械有限公司",
    country: "中国",
    country_code: "CN",
    province: "浙江",
    city: "杭州",
    contact: "张三",
    phone: "13800000000",
    email: "zhang@example.com",
    products: "数控机床",
    industry: "机械",
    certification: null,
    type: null,
    ...over,
  };
}

describe("mapSupplierRow — companyType 类型徽章", () => {
  it("manufacturer → factory（与「工厂/贸易商」页签同源）", () => {
    expect(mapSupplierRow(row({ business_type_code: "manufacturer" })).companyType).toBe("factory");
  });

  it("trader → trader", () => {
    expect(mapSupplierRow(row({ business_type_code: "trader" })).companyType).toBe("trader");
  });

  it("service_provider / other / 缺码 → 留白，绝不按国内外猜测兜底", () => {
    expect(mapSupplierRow(row({ business_type_code: "service_provider" })).companyType).toBeUndefined();
    expect(mapSupplierRow(row({ business_type_code: "other" })).companyType).toBeUndefined();
    expect(mapSupplierRow(row()).companyType).toBeUndefined();
  });

  it("外国 manufacturer 同样显示 factory（徽章跟业务身份走，不跟国籍走）", () => {
    const foreign = row({ country: "United States", country_code: "US", business_type_code: "manufacturer" });
    expect(mapSupplierRow(foreign).companyType).toBe("factory");
  });
});
