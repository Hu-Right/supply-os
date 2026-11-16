import { describe, it, expect } from "vitest";
import {
  guaranteeDefault,
  guaranteeTypes,
  parseGuarantees,
  serializeGuarantees,
} from "@/shared/constants/guarantees";

describe("shared/constants/guarantees", () => {
  it("旧类型列表 → 默认配置（银行/比例/未填值）", () => {
    const list = parseGuarantees(null, "bid_bond,performance_bond");
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(guaranteeDefault("bid_bond"));
    expect(guaranteeTypes(list)).toBe("bid_bond,performance_bond");
  });

  it("新 JSON：保留形式/基数/值/备注", () => {
    const list = parseGuarantees([
      { type: "advance_payment", form: "insurance", basis: "percent", value: 30, note: "交货后解除" },
    ]);
    expect(list[0]).toMatchObject({
      type: "advance_payment",
      form: "insurance",
      basis: "percent",
      value: 30,
      note: "交货后解除",
    });
  });

  it("同类型去重；未知类型丢弃", () => {
    const list = parseGuarantees([
      { type: "bid_bond" },
      { type: "bid_bond" },
      { type: "unknown" },
    ]);
    expect(list).toHaveLength(1);
  });

  it("空值序列化为 null", () => {
    expect(serializeGuarantees([])).toBeNull();
    expect(serializeGuarantees([{ type: "warranty_deposit" }])).toContain('"warranty_deposit"');
  });
});
