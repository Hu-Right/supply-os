/**
 * server/services/suppliers.ts 测试
 */
import { describe, it, expect } from "vitest";
import { mapSupplierRow } from "../../../server/services/suppliers";

describe("mapSupplierRow", () => {
  it("映射基本供应商信息", () => {
    const row = {
      id: 1,
      company: "Test Corp",
      type: "international",
      industry: "Manufacturing",
      country: "Germany",
      country_code: "DE",
      city: "Berlin",
      contact: "Hans",
      email: "hans@test.com",
      phone: "+49123456789",
      products: "Machinery, Electronics",
    };
    const result = mapSupplierRow(row, null);
    expect(result.id).toBe("sup-db-1");
    expect(result.nameZh).toBe("Test Corp");
    expect(result.type).toBe("international");
    expect(result.industryZh).toBe("Manufacturing");
    expect(result.countryZh).toBe("Germany");
    expect(result.countryEn).toBe("Germany");
    expect(result.contactPerson).toBe("Hans");
    expect(result.status).toBe("approved");
  });

  it("国内供应商 type=domestic", () => {
    const row = { id: 2, company: "国内公司", country_code: "CN", country: "中国" };
    const result = mapSupplierRow(row, null);
    expect(result.type).toBe("domestic");
    expect(result.countryEn).toBe("China");
  });

  it("翻译对象存在时使用译文", () => {
    const row = { id: 3, company: "Corp", industry: "制造业", products: "机械" };
    const tr = { industry_tr: "Manufacturing", main_products_tr: "Machinery" };
    const result = mapSupplierRow(row, tr);
    expect(result.industryEn).toBe("Manufacturing");
    expect(result.mainProductsEn).toContain("Machinery");
  });

  it("缺省字段使用默认值", () => {
    const row = { id: 4 };
    const result = mapSupplierRow(row, null);
    expect(result.industryZh).toBe("其他");
    expect(result.countryZh).toBe("中国");
    expect(result.cityZh).toBe("—");
    expect(result.contactEmail).toBe("");
  });

  it("邮箱和手机号脱敏", () => {
    const row = { id: 5, company: "X", email: "test@example.com", phone: "13800138000" };
    const result = mapSupplierRow(row, null);
    expect(result.contactEmail).not.toBe("test@example.com");
    expect(result.contactPhone).not.toBe("13800138000");
  });
});
