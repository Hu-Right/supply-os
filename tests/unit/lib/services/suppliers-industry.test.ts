/**
 * mapSupplierRow 行业口径测试
 * @module tests/unit/lib/services/suppliers-industry.test.ts
 * @description 行业展示此前只有一条路：`industryEn = industryZh = supplier.industry`，
 *              于是六种语言的界面都显示同一串中文文本。接入行业面后规则是：
 *              1. 能解析到标准节点 → 中英文名各取一侧（英文是 ISIC 官方名），并带上码与路径；
 *              2. 解析不到（无主码 / 树里没有这个码）→ 逐字回到旧行为，绝不出现空行业；
 *              3. 自填原文另存 industryText，不与标准口径混写（两者可能说的不是一回事）。
 */
import { describe, it, expect } from "vitest";
import { mapSupplierRow } from "@/lib/services/suppliers";
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
    industry: "安防 / 消防 / 防护",
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

describe("mapSupplierRow — 行业口径", () => {
  it("解析到标准节点：中文走树、英文走树（非中文界面不再显示中文行业名）", () => {
    const s = mapSupplierRow(row(), standard);
    expect(s.industryZh).toBe("照明器具制造");
    expect(s.industryEn).toBe("Manufacture of electric lighting equipment");
    expect(s.industryCode).toBe("UGT-I-032607");
    expect(s.industryPathEn).toHaveLength(3);
    expect(s.industryTags).toHaveLength(2);
  });

  it("自填原文与标准口径并存但分开：industryText 保留原样", () => {
    const s = mapSupplierRow(row(), standard);
    expect(s.industryText).toBe("安防 / 消防 / 防护");
  });

  it("没给行业视图（未装配/装配失败）→ 逐字回到旧行为：两列同文本、无码无路径", () => {
    const s = mapSupplierRow(row());
    expect(s.industryZh).toBe("安防 / 消防 / 防护");
    expect(s.industryEn).toBe(s.industryZh);
    expect(s.industryCode).toBeUndefined();
    expect(s.industryTags).toBeUndefined();
  });

  it("给了视图但码在树里查不到 → 同样回落文本，不把半成品标签推给用户", () => {
    const s = mapSupplierRow(row(), { primary: null, pathZh: [], pathEn: [], tags: [] });
    expect(s.industryZh).toBe("安防 / 消防 / 防护");
    expect(s.industryCode).toBeUndefined();
    expect(s.industryPathZh).toBeUndefined();
  });

  it("行业文本为空时仍按旧规则回落首个产品词（不被新链路改坏）", () => {
    const s = mapSupplierRow(row({ industry: "", industry_code: null }));
    expect(s.industryZh).toBe("LED 灯具");
  });
});
