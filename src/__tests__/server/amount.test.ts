// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  parseEstimatedValue,
  backfillNoticeAmountCache,
  AMOUNT_PARSE_VERSION,
} from "../../../server/services/amount";

// ─── parseEstimatedValue ────────────────────────────────────────────────────
describe("parseEstimatedValue", () => {
  describe("垃圾过滤", () => {
    it("returns null for empty/null input", () => {
      expect(parseEstimatedValue("")).toBeNull();
      expect(parseEstimatedValue(null)).toBeNull();
      expect(parseEstimatedValue(undefined)).toBeNull();
    });

    it("returns null for text without digits", () => {
      expect(parseEstimatedValue("Not specified")).toBeNull();
      expect(parseEstimatedValue("未提及")).toBeNull();
      expect(parseEstimatedValue("待补充")).toBeNull();
    });

    it("returns null for zero-only values", () => {
      expect(parseEstimatedValue("0")).toBeNull();
    });

    it("returns null for overflow amounts (>= 1e15)", () => {
      expect(parseEstimatedValue("9999999999999999")).toBeNull();
    });
  });

  describe("数字提取", () => {
    it("parses plain number", () => {
      const result = parseEstimatedValue("50000");
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(50000);
    });

    it("handles thousands separators", () => {
      const result = parseEstimatedValue("1,234,567.89");
      expect(result!.amount).toBe(1234567.89);
    });

    it("takes midpoint for range values", () => {
      const result = parseEstimatedValue("100000-200000");
      expect(result!.amount).toBe(150000);
    });

    it("handles tilde range", () => {
      const result = parseEstimatedValue("50000~80000");
      expect(result!.amount).toBe(65000);
    });

    it("handles Chinese 至 range", () => {
      const result = parseEstimatedValue("10000至20000");
      expect(result!.amount).toBe(15000);
    });

    it("rounds to 2 decimal places", () => {
      const result = parseEstimatedValue("1234.567");
      expect(result!.amount).toBe(1234.57);
    });
  });

  describe("币种识别", () => {
    it("detects ISO currency code", () => {
      const result = parseEstimatedValue("BRL 173,841.36");
      expect(result!.currency).toBe("BRL");
      expect(result!.amount).toBe(173841.36);
    });

    it("detects lowercase ISO code", () => {
      const result = parseEstimatedValue("6666.67 php");
      expect(result!.currency).toBe("PHP");
    });

    it("detects Chinese currency name", () => {
      const result = parseEstimatedValue("菲律宾比索 50000");
      expect(result!.currency).toBe("PHP");
    });

    it("detects USD symbol", () => {
      const result = parseEstimatedValue("US $ 100000");
      expect(result!.currency).toBe("USD");
    });

    it("detects Euro symbol", () => {
      const result = parseEstimatedValue("€ 250000");
      expect(result!.currency).toBe("EUR");
    });

    it("detects CNY symbol ¥", () => {
      const result = parseEstimatedValue("¥500万");
      expect(result!.currency).toBe("CNY");
    });
  });

  describe("country 推断", () => {
    it("infers currency from country when no explicit currency", () => {
      const result = parseEstimatedValue("500000", "Brazil");
      expect(result!.currency).toBe("BRL");
      expect(result!.inferred).toBe(true);
    });

    it("marks inferred=true when no currency线索", () => {
      const result = parseEstimatedValue("500000", "Unknown Land");
      expect(result!.inferred).toBe(true);
    });

    it("does not infer when explicit currency present", () => {
      const result = parseEstimatedValue("USD 50000", "Brazil");
      expect(result!.currency).toBe("USD");
      expect(result!.inferred).toBe(false);
    });
  });

  describe("USD 换算", () => {
    it("computes amountUsd with known rate", () => {
      const result = parseEstimatedValue("USD 1000");
      expect(result!.amountUsd).toBe(1000);
    });

    it("converts BRL to USD", () => {
      const result = parseEstimatedValue("BRL 1000");
      expect(result!.amountUsd).toBeCloseTo(180, 0); // rate 0.18
    });

    it("returns null amountUsd when currency unknown", () => {
      const result = parseEstimatedValue("50000");
      // no currency, no country → currency null → amountUsd null
      expect(result!.amountUsd).toBeNull();
    });
  });
});

// ─── AMOUNT_PARSE_VERSION ───────────────────────────────────────────────────
describe("AMOUNT_PARSE_VERSION", () => {
  it("is a positive integer", () => {
    expect(AMOUNT_PARSE_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(AMOUNT_PARSE_VERSION)).toBe(true);
  });
});

// ─── backfillNoticeAmountCache ──────────────────────────────────────────────
describe("backfillNoticeAmountCache", () => {
  it("returns processed=0 when no pending rows", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    const result = await backfillNoticeAmountCache(dbPool, [1, 2, 3]);
    expect(result.processed).toBe(0);
  });

  it("parses and inserts amount cache for pending notices", async () => {
    const dbPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[
          { id: 1, estimated_value: "USD 50000", country: "United States" },
          { id: 2, estimated_value: "Not specified", country: "Brazil" },
        ]])
        .mockResolvedValueOnce([[]]),
    };
    const result = await backfillNoticeAmountCache(dbPool);
    expect(result.processed).toBe(2);
    // Second call should be the INSERT
    const insertCall = dbPool.query.mock.calls[1];
    expect(insertCall[0]).toContain("INSERT INTO crm_notice_amount_cache");
  });

  it("filters by noticeIds when provided", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    await backfillNoticeAmountCache(dbPool, [10, 20]);
    const sql = dbPool.query.mock.calls[0][0];
    expect(sql).toContain("AND n.id IN (?,?)");
  });
});
