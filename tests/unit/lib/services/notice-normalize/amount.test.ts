import { describe, expect, it } from "vitest";
import { normalizeAmount } from "@/lib/services/notice-normalize/amount";

describe("normalizeAmount", () => {
  it("巴西 BRL 3,988：3 位逗号按千分位，不按 3.988", () => {
    const a = normalizeAmount("BRL 3,988", { currencyHint: "CNY", countryCode: "BR" });
    expect(a.amount).toBe("3988.00");
    expect(a.currency).toBe("BRL");
    expect(a.flags).toContain("separator_assumed_thousands");
  });

  it("R$ 1.234,56 → 1234.56 BRL", () => {
    const a = normalizeAmount("R$ 1.234,56", { countryCode: "BR" });
    expect(a.amount).toBe("1234.56");
    expect(a.currency).toBe("BRL");
  });

  it("$1,234.56 + US → 1234.56 USD", () => {
    const a = normalizeAmount("$1,234.56", { countryCode: "US" });
    expect(a.amount).toBe("1234.56");
    expect(a.currency).toBe("USD");
  });

  it("EUR 1 234,56 → 1234.56 EUR", () => {
    const a = normalizeAmount("EUR 1 234,56", { countryCode: "FR" });
    expect(a.amount).toBe("1234.56");
    expect(a.currency).toBe("EUR");
  });

  it("裸金额 + 默认 CNY + 非中国：不冒充 CNY", () => {
    const a = normalizeAmount("255000.00", { currencyHint: "CNY", countryCode: "LR" });
    expect(a.amount).toBe("255000.00");
    expect(a.currency).toBeNull();
    expect(a.flags).toContain("currency_default_cny_ignored");
  });

  it("从正文标签取金额", () => {
    const a = normalizeAmount(null, {
      description: "Valor estimado: R$ 1.234,56, conforme edital.",
      countryCode: "BR",
    });
    expect(a.amount).toBe("1234.56");
    expect(a.currency).toBe("BRL");
    expect(a.flags).toContain("amount_from_description");
  });

  it("保密/未告知 → null，不编造", () => {
    const a = normalizeAmount("Sigiloso", { countryCode: "BR" });
    expect(a.amount).toBeNull();
    expect(a.flags).toContain("amount_confidential_or_unknown");
  });

  it("USD 1 million → 1000000.00", () => {
    const a = normalizeAmount("USD 1 million", { countryCode: "US" });
    expect(a.amount).toBe("1000000.00");
    expect(a.currency).toBe("USD");
    expect(a.flags).toContain("amount_scaled_by_suffix");
  });

  it("1.234（无上下文）按千分位并打标", () => {
    const a = normalizeAmount("1.234", { countryCode: "US" });
    expect(a.amount).toBe("1234.00");
    expect(a.flags).toContain("separator_assumed_thousands");
  });

  it("France 裸金额 + 默认 CNY → EUR，但标 inferred", () => {
    const a = normalizeAmount("608000000", { currencyHint: "CNY", countryCode: "FR" });
    expect(a.amount).toBe("608000000.00");
    expect(a.currency).toBe("EUR");
    expect(a.currencySource).toBe("inferred");
    expect(a.flags).toContain("currency_default_cny_ignored");
    expect(a.flags).toContain("currency_inferred_from_country");
  });

  it("Liberia 裸金额 + 默认 CNY → 不推断币种", () => {
    const a = normalizeAmount("255000.00", { currencyHint: "CNY", countryCode: "LR" });
    expect(a.amount).toBe("255000.00");
    expect(a.currency).toBeNull();
    expect(a.currencySource).toBe("none");
  });

  it("0.00 → 视为未告知，不落 0", () => {
    const a = normalizeAmount("0.00", { currencyHint: "CNY", countryCode: "PK" });
    expect(a.amount).toBeNull();
    expect(a.flags).toContain("amount_zero");
  });
});
