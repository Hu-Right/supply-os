/**
 * 供应商企业主页视图装配单测
 *
 * @module tests/unit/lib/services/supplier-profile
 * @description 契约：
 *              1. 真实字段装配（工商信息/产品/资质/官网），空值一律 null/空数组；
 *              2. 公开面隐私：联系方式与信用代码脱敏、营业执照只给「已上传」标志；
 *              3. 行业面标签缺失时回落产品首项，不造码；
 *              4. 国内/国际判定优先 country_code。
 */
import { describe, it, expect } from "vitest";
import { supplierProfileViewOf } from "@/lib/services/supplier-profile";
import type { SupplierDirectoryRow } from "@/lib/repos/suppliers";

function row(overrides: Partial<SupplierDirectoryRow> = {}): SupplierDirectoryRow {
  return {
    id: 10,
    company: "杭州示例机械有限公司",
    country: "中国",
    country_code: "CN",
    province: "浙江",
    city: "杭州",
    contact: "李四",
    position: "销售经理",
    phone: "13800138000",
    email: "sales@example.com",
    address: "西湖区文一西路 1 号",
    website: "example.com",
    products: "数控机床, 激光设备、自动化设备",
    industry_code: "UGT-I-03220201",
    certification: "ISO9001,CE",
    credit_code: "91330100123456789X",
    credit_code_type: "uscc",
    legal_rep: "张三",
    established_at: "2015-03-01",
    registered_capital: "10000000",
    currency: "CNY",
    verify_status: "done",
    info_review_status: "reviewed",
    license_url: "/uploads/license.png",
    data_quality_score: 82,
    ...overrides,
  };
}

describe("supplierProfileViewOf", () => {
  it("装配真实工商/产品/资质字段，联系方式与信用代码脱敏、执照只给标志", () => {
    const view = supplierProfileViewOf(row());
    expect(view.company).toBe("杭州示例机械有限公司");
    expect(view.type).toBe("domestic");
    expect(view.establishedAt).toBe("2015-03");
    expect(view.registeredCapital).toBe("10,000,000 人民币");
    expect(view.products).toEqual(["数控机床", "激光设备", "自动化设备"]);
    expect(view.certifications).toEqual(["ISO9001", "CE"]);
    expect(view.website).toBe("https://example.com/");
    expect(view.creditCodeMasked).toBe("9133****789X");
    expect(view.creditCodeTypeLabel).toBe("统一社会信用代码");
    expect(view.hasLicense).toBe(true);
    expect(view.verifyStatus).toBe("done");
    expect(view.reviewed).toBe(true);
    expect(view.dataCompleteness).toBe(82);
    // 隐私：明文不得出现在公开视图
    expect(view.contact.phone).not.toContain("13800138000");
    expect(view.contact.email).not.toContain("sales@example.com");
    expect(view.contact.person).not.toBe("李四");
    expect(view.legalRepMasked).not.toBe("张三");
  });

  it("空字段不造数据：缺失项为 null/空数组，行业无码时不编造", () => {
    const view = supplierProfileViewOf(
      row({
        country: "United States",
        country_code: "US",
        province: null,
        city: null,
        address: null,
        website: null,
        products: null,
        certification: null,
        credit_code: null,
        legal_rep: null,
        established_at: null,
        registered_capital: null,
        currency: null,
        verify_status: "unverified",
        info_review_status: "unreviewed",
        license_url: null,
        data_quality_score: 41,
        contact: null,
        position: null,
        phone: null,
        email: null,
      }),
    );
    expect(view.type).toBe("international");
    expect(view.website).toBeNull();
    expect(view.products).toEqual([]);
    expect(view.certifications).toEqual([]);
    expect(view.creditCodeMasked).toBe("");
    expect(view.registeredCapital).toBeNull();
    expect(view.establishedAt).toBeNull();
    expect(view.legalRepMasked).toBe("");
    expect(view.hasLicense).toBe(false);
    expect(view.verifyStatus).toBe("unverified");
    expect(view.reviewed).toBe(false);
    expect(view.industry.primary).toBeNull();
    expect(view.dataCompleteness).toBe(41);
    expect(view.commodityInterests).toEqual([]);
  });

  it("平台归类：品目双语名与 L2 分组解析，主品目标记保留", () => {
    const view = supplierProfileViewOf(row(), null, undefined, [
      {
        code: "UGT-1103010205",
        name: "激光切割机 (Laser cutting machine)",
        level: 5,
        level2_id: 10726,
        l2_code: "UGT-1103",
        l2_name_zh: "金属加工机械",
        l2_name_en: "Metalworking Machinery",
        path_text: null,
        confidence: "95.00",
        weight: "2.80",
        is_primary: 1,
      },
      {
        code: "UGT-11030201",
        name: "金属折弯机 (Metal bending machines)",
        level: 4,
        level2_id: 10726,
        l2_code: "UGT-1103",
        l2_name_zh: "金属加工机械",
        l2_name_en: "Metalworking Machinery",
        path_text: null,
        confidence: "90.00",
        weight: "2.20",
        is_primary: 0,
      },
    ]);
    expect(view.commodityInterests).toHaveLength(2);
    expect(view.commodityInterests[0]).toMatchObject({
      code: "UGT-1103010205",
      nameZh: "激光切割机",
      nameEn: "Laser cutting machine",
      level: 5,
      confidence: 95,
      isPrimary: true,
      categoryZh: "金属加工机械",
      categoryEn: "Metalworking Machinery",
    });
    expect(view.commodityInterests[1].isPrimary).toBe(false);
  });
});
