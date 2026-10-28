/**
 * supplierViewOf 的 wire 键集合取证（命名红线② B 组收敛）。
 *
 * 为什么需要这一例：`GET /api/suppliers` 与 `GET /api/suppliers/:id` 是整块透出
 * （`json(dtoItems)` / `json({ ...supplierViewOf(...), claimed })`），门禁静态面看不见键。
 * 2026-10-28 把这两行从「整块透出」登记集删掉，依据是 mapper 改用约定名后规则二能自认出「已过视图」——
 * 名字只是让门禁**不再报错**，键集合本身必须有人钉住，否则新增一列 snake 就悄悄上网。
 * 这里钉的就是那件事（真库探针此前实测 26 键全 camel，本例把同一事实固化成不依赖库的断言）。
 */
import { describe, expect, it } from "vitest";
import { supplierViewOf } from "@/lib/services/suppliers";
import type { SupplierDirectoryRow } from "@/lib/repos/suppliers";
import type { SupplierIndustryInfo } from "@/lib/services/industry-labels";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

function row(over: Partial<SupplierDirectoryRow> = {}): SupplierDirectoryRow {
  return {
    id: 123,
    company: "上海苏钠米实业发展有限公司",
    country: "China",
    country_code: "CN",
    province: "上海",
    city: "上海",
    contact: "张三",
    phone: "13887654321",
    email: "zhang@example.com",
    products: "LED 灯具,数控机床",
    industry_code: "UGT-I-032607",
    certification: "ISO9001质量管理体系认证,CE认证（欧盟）",
    business_type_code: "manufacturer",
    ...over,
  } as SupplierDirectoryRow;
}

const standard: SupplierIndustryInfo = {
  primary: { code: "UGT-I-032607", nameZh: "照明器具制造", nameEn: "Manufacture of electric lighting equipment" },
  pathZh: ["制造业", "电气机械和器材制造业", "照明器具制造"],
  pathEn: ["Manufacturing", "Manufacture of electrical equipment", "Manufacture of electric lighting equipment"],
  tags: [{ code: "UGT-I-032607", nameZh: "照明器具制造", nameEn: "Manufacture of electric lighting equipment" }],
};

/** 视图键集合（按 mapper 声明顺序书写；比对时两边同排序） */
const SUPPLIER_VIEW_KEYS = [
  "id",
  "nameZh",
  "nameEn",
  "type",
  "industryZh",
  "industryEn",
  "industryCode",
  "industryText",
  "industryPathZh",
  "industryPathEn",
  "industryTags",
  "countryZh",
  "countryEn",
  "cityZh",
  "cityEn",
  "mainProductsZh",
  "mainProductsEn",
  "complianceLabelsZh",
  "complianceLabelsEn",
  "companyType",
  "contactPerson",
  "contactEmail",
  "contactPhone",
  "status",
  "dataCompleteness",
];

describe("supplierViewOf — wire 键集合", () => {
  it("键集合定形（25 键）且没有一个 snake_case 键", () => {
    const view = supplierViewOf(row(), standard);
    expect([...Object.keys(view)].sort()).toEqual([...SUPPLIER_VIEW_KEYS].sort());
    expect(Object.keys(view).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("嵌套值里也不许出现 snake 键（行业标签/路径是对象数组，容易被当成列名直出）", () => {
    const view = supplierViewOf(row(), standard);
    const nested: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (SNAKE_KEY.test(k)) nested.push(`${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
    };
    walk(view, "$");
    expect(nested).toEqual([]);
  });

  it("装配缺失（无行业视图、无国家快照）不改变键集合，只留 undefined 值", () => {
    // 钉住这一点：视图是「显式列字段」而不是 {...row} 展开，
    // 否则降级路径会把 supplier 表的列名（industry_code/country_code…）直接推上 wire
    const bare = supplierViewOf(row());
    expect([...Object.keys(bare)].sort()).toEqual([...SUPPLIER_VIEW_KEYS].sort());
    expect(bare.industryCode).toBeUndefined();
    expect(bare.industryTags).toBeUndefined();
    expect(Object.keys(bare).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("联系方式已脱敏，且 id 带 sup-db- 前缀（下游按前缀剥离取主键）", () => {
    const view = supplierViewOf(row(), standard);
    expect(view.id).toBe("sup-db-123");
    // 现行脱敏口径：手机/邮箱不留原值，但邮箱域名保留（只掩本地名）——
    // 本例把该口径钉住：哪天改成全掩或域名也掩，这里会红，前端展示要同步过。
    expect(view.contactPhone).not.toContain("13887654321");
    expect(view.contactPhone).toContain("*");
    expect(view.contactEmail).not.toContain("zhang@");
    expect(view.contactEmail).toMatch(/\*+@example\.com$/);
  });
});
