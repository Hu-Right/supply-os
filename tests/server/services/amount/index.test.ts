/**
 * server/services/amount/parser.ts 测试
 * 覆盖金额解析纯函数 parseEstimatedValue
 */
import { describe, it, expect } from "vitest";
import { parseEstimatedValue, AMOUNT_PARSE_VERSION } from "../../../../server/services/amount/parser";

describe("AMOUNT_PARSE_VERSION", () => {
  it("版本号 = 1", () => {
    expect(AMOUNT_PARSE_VERSION).toBe(1);
  });
});

describe("parseEstimatedValue", () => {
  // ── 垃圾过滤 ──
  it("空/null 返回 null", () => {
    expect(parseEstimatedValue("")).toBeNull();
    expect(parseEstimatedValue(null)).toBeNull();
    expect(parseEstimatedValue(undefined)).toBeNull();
  });

  it("不含数字返回 null", () => {
    expect(parseEstimatedValue("Not specified")).toBeNull();
    expect(parseEstimatedValue("待补充")).toBeNull();
  });

  it("全零返回 null", () => {
    expect(parseEstimatedValue("0")).toBeNull();
    expect(parseEstimatedValue("0.00")).toBeNull();
  });

  // ── 纯数字 ──
  it("纯数字直接解析", () => {
    const result = parseEstimatedValue("500000");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(500000);
    expect(result!.currency).toBeNull(); // 无币种线索
    expect(result!.amountUsd).toBeNull();
  });

  it("千分位逗号正确去除", () => {
    const result = parseEstimatedValue("1,500,000");
    expect(result!.amount).toBe(1500000);
  });

  // ── 区间 ──
  it("区间取中位", () => {
    const result = parseEstimatedValue("100000-200000");
    expect(result!.amount).toBe(150000);
  });

  it("中文区间（至）", () => {
    const result = parseEstimatedValue("100000至200000");
    expect(result!.amount).toBe(150000);
  });

  // ── 币种识别：ISO 代码 ──
  it("ISO 代码 USD", () => {
    const result = parseEstimatedValue("USD 500000");
    expect(result!.currency).toBe("USD");
    expect(result!.amountUsd).toBe(500000);
    expect(result!.inferred).toBe(false);
  });

  it("ISO 代码 EUR", () => {
    const result = parseEstimatedValue("EUR 100,000");
    expect(result!.currency).toBe("EUR");
    expect(result!.amountUsd).toBeCloseTo(108000, 0);
  });

  it("ISO 代码 BRL", () => {
    const result = parseEstimatedValue("BRL 173,841.36");
    expect(result!.currency).toBe("BRL");
    expect(result!.amount).toBe(173841.36);
    expect(result!.amountUsd).toBeCloseTo(31291.44, 0);
  });

  // ── 币种识别：中文名称 ──
  it("中文币种名 美元", () => {
    const result = parseEstimatedValue("500000美元");
    expect(result!.currency).toBe("USD");
  });

  it("中文币种名 人民币", () => {
    const result = parseEstimatedValue("1000000人民币");
    expect(result!.currency).toBe("CNY");
  });

  // ── 币种识别：货币符号 ──
  it("US$ 符号", () => {
    const result = parseEstimatedValue("US$ 500000");
    expect(result!.currency).toBe("USD");
  });

  it("€ 欧元符号", () => {
    const result = parseEstimatedValue("€ 100000");
    expect(result!.currency).toBe("EUR");
  });

  it("¥ 人民币符号", () => {
    const result = parseEstimatedValue("¥ 500000");
    expect(result!.currency).toBe("CNY");
  });

  it("₹ 印度卢比符号", () => {
    const result = parseEstimatedValue("₹ 1000000");
    expect(result!.currency).toBe("INR");
  });

  // ── 国家推断 ──
  it("国家推断 Brazil → BRL（inferred=true）", () => {
    const result = parseEstimatedValue("500000", "Brazil");
    expect(result!.currency).toBe("BRL");
    expect(result!.inferred).toBe(true);
    expect(result!.amountUsd).not.toBeNull();
  });

  it("国家推断 Japan → JPY", () => {
    const result = parseEstimatedValue("10000000", "Japan");
    expect(result!.currency).toBe("JPY");
    expect(result!.inferred).toBe(true);
  });

  it("无币种线索且无国家 → currency=null, amountUsd=null", () => {
    const result = parseEstimatedValue("500000");
    expect(result!.currency).toBeNull();
    expect(result!.amountUsd).toBeNull();
    expect(result!.inferred).toBe(true);
  });

  // ── 防脏数据 ──
  it("超大金额（≥1e15）返回 null", () => {
    expect(parseEstimatedValue("9999999999999999")).toBeNull();
  });

  // ── 小数精度 ──
  it("金额保留两位小数", () => {
    const result = parseEstimatedValue("123456.789");
    expect(result!.amount).toBe(123456.79);
  });
});
