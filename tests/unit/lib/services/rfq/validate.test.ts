/**
 * RFQ 提交校验单测
 * @module tests/unit/lib/services/rfq/validate
 */
import { describe, it, expect } from "vitest";
import {
  DEMAND_COLUMN_LIMITS,
  isQuoteWindowShort,
  validateDemandDraft,
  type DemandDraftInput,
} from "@/lib/services/rfq/validate";

const NOW = 1_777_593_600; // 2026-05-01T00:00:00Z

function valid(over: Partial<DemandDraftInput> = {}): DemandDraftInput {
  return {
    title: "采购光伏组件 10MW",
    description: "用于西北地区分布式电站，需满足双面双玻与 25 年功率质保，含运输与卸货，验收按 GB/T 9535 执行。",
    categoryCode: "UGT-0301",
    closeAt: NOW + 10 * 86400,
    budgetAmount: 1200,
    budgetConfidential: false,
    contactName: "张三",
    contactEmail: "buyer@example.com",
    contactPhone: "13800000000",
    incoterm: "FOB",
    deliveryTime: "合同签订后 60 天",
    provinceName: "陕西省",
    quantity: 10,
    quantityUnit: "MW",
    ...over,
  };
}

function fields(input: DemandDraftInput): string[] {
  const res = validateDemandDraft(input, NOW);
  return res.ok ? [] : res.errors.map((e) => e.field);
}

describe("validateDemandDraft — 基本规则", () => {
  it("完整合法输入通过", () => {
    expect(validateDemandDraft(valid(), NOW)).toEqual({ ok: true });
  });

  it("标题过短/过长都拦（上限取 min(SSOT, 列宽)）", () => {
    expect(fields(valid({ title: "采购组件" }))).toContain("title");
    expect(fields(valid({ title: "采购".repeat(26) }))).toContain("title");
  });

  it("描述长度边界", () => {
    expect(fields(valid({ description: "太短" }))).toContain("description");
    expect(fields(valid({ description: "字".repeat(2001) }))).toContain("description");
  });

  it("联系人超过列宽（64）即拦——证明不再以路由里的 100 为准", () => {
    const tooLong = "名".repeat(DEMAND_COLUMN_LIMITS.contactName + 1);
    expect(fields(valid({ contactName: tooLong }))).toContain("contactName");
    expect(fields(valid({ contactName: "名".repeat(DEMAND_COLUMN_LIMITS.contactName) }))).not.toContain("contactName");
  });

  it("邮箱格式", () => {
    expect(fields(valid({ contactEmail: "not-an-email" }))).toContain("contactEmail");
  });

  it("贸易术语白名单", () => {
    expect(fields(valid({ incoterm: "XYZ" }))).toContain("incoterm");
    expect(fields(valid({ incoterm: "CIF" }))).not.toContain("incoterm");
  });

  it("截止时间必须晚于当前", () => {
    expect(fields(valid({ closeAt: NOW - 1 }))).toContain("closeAt");
    expect(fields(valid({ closeAt: null }))).toContain("closeAt");
  });

  it("数量必须为正", () => {
    expect(fields(valid({ quantity: 0 }))).toContain("quantity");
  });
});

describe("validateDemandDraft — 金额与保密", () => {
  it("非保密：预算必须 > 0，负数与 0 都拦", () => {
    expect(fields(valid({ budgetAmount: 0 }))).toContain("budgetAmount");
    expect(fields(valid({ budgetAmount: -5 }))).toContain("budgetAmount");
    expect(fields(valid({ budgetAmount: Number.NaN }))).toContain("budgetAmount");
  });

  it("保密：可以不填金额，但金额不得为负", () => {
    expect(fields(valid({ budgetConfidential: true, budgetAmount: null }))).not.toContain("budgetAmount");
    expect(fields(valid({ budgetConfidential: true, budgetAmount: -1 }))).toContain("budgetAmount");
  });
});

describe("isQuoteWindowShort", () => {
  it("小于 7 天提示", () => {
    expect(isQuoteWindowShort(NOW + 3 * 86400, NOW)).toBe(true);
    expect(isQuoteWindowShort(NOW + 10 * 86400, NOW)).toBe(false);
  });
});
