import { describe, it, expect } from "vitest";
import { PROCUREMENT_CURRENCIES, parseBudgetAmount } from "@/shared/constants/procurement-currencies";

describe("shared/constants/procurement-currencies", () => {
  it("常用币种包含 CNY/USD/EUR 且有足够覆盖", () => {
    expect(PROCUREMENT_CURRENCIES).toContain("CNY");
    expect(PROCUREMENT_CURRENCIES).toContain("USD");
    expect(PROCUREMENT_CURRENCIES).toContain("EUR");
    expect(PROCUREMENT_CURRENCIES.length).toBeGreaterThan(20);
  });

  it("金额按原始单位解析，允许千分位逗号与空格", () => {
    expect(parseBudgetAmount("1000000")).toBe(1000000);
    expect(parseBudgetAmount("1,000,000")).toBe(1000000);
    expect(parseBudgetAmount(" 1 000 000 ")).toBe(1000000);
    expect(parseBudgetAmount("1234.56")).toBe(1234.56);
  });

  it("空串/非法/负数返回 null", () => {
    expect(parseBudgetAmount("")).toBeNull();
    expect(parseBudgetAmount("100万")).toBeNull();
    expect(parseBudgetAmount("-1")).toBeNull();
    expect(parseBudgetAmount(undefined)).toBeNull();
  });
});
