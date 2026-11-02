import { describe, it, expect } from "vitest";
import { parseAmountUsd, USD_RATE_ROUGH } from "@/lib/services/notice-normalize/amount";
import { AMOUNT_PARSE_VERSION } from "@/lib/services/amount";

/**
 * 金额解析器二合一后的读路径单测（2026-10-31）。
 * 旧 parser.test 的等价场景全部迁入新口径；关键行为差异：
 * 零线索时 currency=null / amountUsd=null（旧版会把任意 3 字母词当 ISO 码瞎猜）。
 */

describe("parseAmountUsd · 基础解析", () => {
  it("空值 → amount=null", () => {
    expect(parseAmountUsd("").amount).toBeNull();
    expect(parseAmountUsd(null).amount).toBeNull();
    expect(parseAmountUsd(undefined).amount).toBeNull();
  });

  it("无数字 → null（垃圾过滤）", () => {
    expect(parseAmountUsd("Not specified").amount).toBeNull();
    expect(parseAmountUsd("待补充").amount).toBeNull();
  });

  it("纯数字 → 解析金额", () => {
    const r = parseAmountUsd("1000000");
    expect(r.amount).toBe(1000000);
  });

  it("BRL 173,841.36 → 结构式解析金额+币种（千分位消歧）", () => {
    const r = parseAmountUsd("BRL 173,841.36");
    expect(r.amount).toBe(173841.36);
    expect(r.currency).toBe("BRL");
    expect(r.amountUsd).toBeGreaterThan(0);
  });

  it("1.234 BRL → 1234（结构式判定：尾段 3 位=千分位；旧正则口径错判为 1.234）", () => {
    const r = parseAmountUsd("1.234 BRL", "Brazil");
    expect(r.amount).toBe(1234);
    expect(r.currency).toBe("BRL");
  });

  it("区间 → 适配层取 amount 主值", () => {
    const r = parseAmountUsd("100000-200000", "Brazil");
    expect(r.amount).toBeGreaterThan(0);
  });

  it("中文币种名 → 识别（读路径独有能力，合入后保留）", () => {
    expect(parseAmountUsd("巴西雷亚尔 50000").currency).toBe("BRL");
    expect(parseAmountUsd("菲律宾比索 250000").currency).toBe("PHP");
  });

  it("货币符号 → 币种", () => {
    expect(parseAmountUsd("€50000").currency).toBe("EUR");
    expect(parseAmountUsd("£30000").currency).toBe("GBP");
    expect(parseAmountUsd("US $120000").currency).toBe("USD");
    expect(parseAmountUsd("R$500000").currency).toBe("BRL");
    expect(parseAmountUsd("₱250000").currency).toBe("PHP");
    expect(parseAmountUsd("₹400000").currency).toBe("INR");
  });
});

describe("parseAmountUsd · 币种推断与诚实性", () => {
  it("英文国名推断 → inferred=true（读路径入参是国名非码）", () => {
    const r = parseAmountUsd("50000", "Brazil");
    expect(r.currency).toBe("BRL");
    expect(r.inferred).toBe(true);
  });

  it("零线索（裸数字无国家）→ currency=null / amountUsd=null，绝不瞎猜（旧版会安 EUR/UAH 等）", () => {
    const r = parseAmountUsd("35200");
    expect(r.amount).toBe(35200);
    expect(r.currency).toBeNull();
    expect(r.amountUsd).toBeNull();
    expect(r.inferred).toBe(true);
  });

  it("超大金额（≥1e15）→ null（防 DECIMAL 溢出）", () => {
    expect(parseAmountUsd("9999999999999999").amount).toBeNull();
  });

  it("全零 → null", () => {
    expect(parseAmountUsd("0").amount).toBeNull();
  });
});

describe("parseAmountUsd · 折算", () => {
  it("USD 原生 → amountUsd=amount", () => {
    const r = parseAmountUsd("USD 10000", "United States");
    expect(r.amountUsd).toBe(10000);
  });

  it("折算用粗汇率表（数量级可比口径）", () => {
    const r = parseAmountUsd("BRL 10000", "Brazil");
    expect(r.amountUsd).toBe(Math.round(10000 * USD_RATE_ROUGH.BRL * 100) / 100);
  });
});

describe("AMOUNT_PARSE_VERSION", () => {
  it("v2（解析器二合一触发全量缓存重算）", () => {
    expect(AMOUNT_PARSE_VERSION).toBe(2);
  });
});
