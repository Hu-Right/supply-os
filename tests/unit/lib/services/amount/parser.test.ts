import { describe, it, expect } from "vitest";
import { parseEstimatedValue, AMOUNT_PARSE_VERSION } from "@/lib/services/amount/parser";

describe("parseEstimatedValue", () => {
  it("空值 → null", () => {
    expect(parseEstimatedValue("")).toBeNull();
    expect(parseEstimatedValue(null)).toBeNull();
    expect(parseEstimatedValue(undefined)).toBeNull();
  });

  it("无数字 → null（垃圾过滤）", () => {
    expect(parseEstimatedValue("Not specified")).toBeNull();
    expect(parseEstimatedValue("待补充")).toBeNull();
  });

  it("纯数字 → 解析金额，无币种", () => {
    const r = parseEstimatedValue("1000000");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000000);
    expect(r!.currency).toBeNull();
  });

  it("BRL 173,841.36 → 解析金额+币种", () => {
    const r = parseEstimatedValue("BRL 173,841.36");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(173841.36);
    expect(r!.currency).toBe("BRL");
    expect(r!.amountUsd).toBeGreaterThan(0);
  });

  it("区间 → 取中位", () => {
    const r = parseEstimatedValue("100000-200000");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150000);
  });

  it("中文币种名 → 识别", () => {
    const r = parseEstimatedValue("巴西雷亚尔 50000");
    expect(r).not.toBeNull();
    expect(r!.currency).toBe("BRL");
  });

  it("货币符号 € → EUR", () => {
    const r = parseEstimatedValue("€50000");
    expect(r!.currency).toBe("EUR");
  });

  it("货币符号 £ → GBP", () => {
    const r = parseEstimatedValue("£30000");
    expect(r!.currency).toBe("GBP");
  });

  it("货币符号 US$ → USD", () => {
    const r = parseEstimatedValue("US $120000");
    expect(r!.currency).toBe("USD");
  });

  it("货币符号 ¥/￥ → CNY", () => {
    expect(parseEstimatedValue("¥800000")!.currency).toBe("CNY");
    expect(parseEstimatedValue("￥800000")!.currency).toBe("CNY");
  });

  it("货币符号 R$ → BRL、₱ → PHP、₹ → INR、₩ → KRW", () => {
    expect(parseEstimatedValue("R$500000")!.currency).toBe("BRL");
    expect(parseEstimatedValue("₱250000")!.currency).toBe("PHP");
    expect(parseEstimatedValue("₹400000")!.currency).toBe("INR");
    expect(parseEstimatedValue("₩100000000")!.currency).toBe("KRW");
  });

  it("country 推断币种 → inferred=true", () => {
    const r = parseEstimatedValue("50000", "Brazil");
    expect(r!.currency).toBe("BRL");
    expect(r!.inferred).toBe(true);
  });

  it("超大金额（≥1e15）→ null", () => {
    expect(parseEstimatedValue("9999999999999999")).toBeNull();
  });

  it("全零 → null", () => {
    expect(parseEstimatedValue("0")).toBeNull();
  });

  it("AMOUNT_PARSE_VERSION = 1", () => {
    expect(AMOUNT_PARSE_VERSION).toBe(1);
  });
});
