/**
 * supplierViewOf 行业口径测试
 * @module tests/unit/lib/services/suppliers-industry.test.ts
 * @description 行业展示规则（supplier.industry 自由文本列已于 2026-10-15 退役）：
 *              1. 能解析到标准节点 → 中英文名各取一侧（英文是 ISIC 官方名），并带上码与路径；
 *              2. 解析不到（无主码 / 树里没有这个码）→ 回落主营产品首项（再为空则“其他”）；
 *              3. 兼容展示文本另存 industryText（= 回落文本），不与标准口径混写。
 */
import { describe, it, expect } from "vitest";
import { supplierViewOf } from "@/lib/services/suppliers";
import type { SupplierDirectoryRow } from "@/lib/repos/suppliers";
import type { SupplierIndustryInfo } from "@/lib/services/industry-labels";

function row(over: Partial<SupplierDirectoryRow> = {}): SupplierDirectoryRow {
  return {
    id: 3,
    company: "上海苏钠米实业发展有限公司",
    country: "China",
    country_code: "CN",
    province: "上海",
    city: "上海",
    contact: "",
    phone: "",
    email: "",
    products: "LED 灯具",
    industry_code: "UGT-I-032607",
    certification: null,
    type: "foreign",
    ...over,
  } as SupplierDirectoryRow;
}

const standard: SupplierIndustryInfo = {
  primary: { code: "UGT-I-032607", nameZh: "照明器具制造", nameEn: "Manufacture of electric lighting equipment" },
  pathZh: ["制造业", "电气机械和器材制造业", "照明器具制造"],
  pathEn: ["Manufacturing", "Manufacture of electrical equipment", "Manufacture of electric lighting equipment"],
  tags: [
    { code: "UGT-I-032607", nameZh: "照明器具制造", nameEn: "Manufacture of electric lighting equipment" },
    { code: "UGT-I-032604", nameZh: "其他电气机械制造", nameEn: "Other electrical machinery" },
  ],
};

describe("supplierViewOf — 行业口径", () => {
  it("解析到标准节点：中文走树、英文走树（非中文界面不再显示中文行业名）", () => {
    const s = supplierViewOf(row(), standard);
    expect(s.industryZh).toBe("照明器具制造");
    expect(s.industryEn).toBe("Manufacture of electric lighting equipment");
    expect(s.industryCode).toBe("UGT-I-032607");
    expect(s.industryPathEn).toHaveLength(3);
    expect(s.industryTags).toHaveLength(2);
  });

  it("无标准码时 industryText 回落主营产品首项", () => {
    const s = supplierViewOf(row(), standard);
    expect(s.industryText).toBe("LED 灯具");
  });

  it("没给行业视图（未装配/装配失败）→ 两列同回落产品首项、无码无路径", () => {
    const s = supplierViewOf(row());
    expect(s.industryZh).toBe("LED 灯具");
    expect(s.industryEn).toBe(s.industryZh);
    expect(s.industryCode).toBeUndefined();
    expect(s.industryTags).toBeUndefined();
  });

  it("给了视图但码在树里查不到 → 同样回落产品首项，不把半成品标签推给用户", () => {
    const s = supplierViewOf(row(), { primary: null, pathZh: [], pathEn: [], tags: [] });
    expect(s.industryZh).toBe("LED 灯具");
    expect(s.industryCode).toBeUndefined();
    expect(s.industryPathZh).toBeUndefined();
  });

  it("行业文本为空时仍按旧规则回落首个产品词（不被新链路改坏）", () => {
    const s = supplierViewOf(row({ industry: "", industry_code: null }));
    expect(s.industryZh).toBe("LED 灯具");
  });
});
