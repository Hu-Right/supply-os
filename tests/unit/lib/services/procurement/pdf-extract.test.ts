/**
 * F02 需求 PDF 规则抽取单测（不依赖外部 LLM）
 * @module tests/unit/lib/services/procurement/pdf-extract
 */
import { describe, it, expect } from "vitest";
import { extractRequirementFields } from "@/lib/services/procurement/pdf-extract";

const SAMPLE = `某海外学校教学设备采购需求
项目背景：为改善教学条件，采购一批课桌椅与电子白板。
用途：海外学校教室，常温干燥环境。
强制性标准：符合 ISO 9001 与 EN 1729。
交货地点：肯尼亚 内罗毕 某学校
报价截止：2026-12-15
采购预算：120,000 美元
学生课桌    双人钢木    2000    套
学生椅    钢架塑料座面    3000    把
电子白板    86寸触摸    100    台`;

describe("extractRequirementFields", () => {
  it("抽取标题/背景/用途/标准/交付/截止/预算", () => {
    const r = extractRequirementFields(SAMPLE);
    expect(r.titleZh).toBe("某海外学校教学设备采购需求");
    expect(r.background).toContain("改善教学条件");
    expect(r.usageEnv).toContain("常温干燥");
    expect(r.standards).toContain("ISO 9001");
    expect(r.deliveryCountry).toBe("肯尼亚");
    expect(r.deliveryCity).toBe("内罗毕");
    expect(r.deliveryAddress).toContain("某学校");
    expect(r.quoteDeadlineDate).toBe("2026-12-15");
    expect(r.budgetAmount).toBe("120000");
    expect(r.budgetCurrency).toBe("USD");
  });

  it("抽取明细行（名称/规格/数量/单位）并给出来源", () => {
    const r = extractRequirementFields(SAMPLE);
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toEqual({ nameZh: "学生课桌", spec: "双人钢木", quantity: 2000, qtyUnit: "套" });
    expect(r.sources["item.0"]).toContain("学生课桌");
  });

  it("空文本 → 全空结果，不抛错", () => {
    const r = extractRequirementFields("");
    expect(r.items).toEqual([]);
    expect(r.titleZh).toBe("");
  });
});
