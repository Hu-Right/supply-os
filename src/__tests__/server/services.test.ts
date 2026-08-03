// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { hashPassword } from "../../../server/services/auth";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "../../../server/services/notices";
import { mapSupplierRow } from "../../../server/services/suppliers";
import { fetchWithTimeout } from "../../../server/services/translation/fetchWithTimeout";
import { translateViaChain, protectTerms } from "../../../server/services/translation/chain";
import { runIncrementalTranslation } from "../../../server/services/autoTranslate";
import { detectSourceLang, translateNoticeViaChain } from "../../../server/services/notice-translation";

// autoTranslate 依赖的翻译入口整体 mock，隔离定时任务扫描逻辑
vi.mock("../../../server/services/notice-translation", () => ({
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn(),
  detectSourceLang: vi.fn(() => null),
}));

// Gemini SDK 整体 mock，避免链尾兜底通道产生真实网络调用
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(),
}));

// ─── translateViaChain（DeepSeek→Gemini 双层链）────────────────────────
describe("translateViaChain", () => {
  it("throws TRANSLATION_UNAVAILABLE when all channels unconfigured", async () => {
    const saved = {
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    // 占位符值视为未配置：两通道均跳过 → 链尾抛统一错误码
    process.env.DEEPSEEK_API_KEY = "MY_DEEPSEEK_API_KEY";
    process.env.GEMINI_API_KEY = "MY_GEMINI_API_KEY";
    try {
      await expect(translateViaChain(["hello"], "en", "zh"))
        .rejects.toThrow("TRANSLATION_UNAVAILABLE");
    } finally {
      process.env.DEEPSEEK_API_KEY = saved.DEEPSEEK_API_KEY;
      process.env.GEMINI_API_KEY = saved.GEMINI_API_KEY;
    }
  });

  it("passes empty texts through without calling any channel", async () => {
    const result = await translateViaChain(["", "  "], "en", "zh");
    expect(result).toEqual({ translations: ["", "  "], provider: "none" });
  });

  it("records degradation trail when deepseek fails and gemini succeeds", async () => {
    const saved = {
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    // DeepSeek HTTP 500 → 降级 Gemini 成功 → degradedFrom 记录失败通道及原因
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    vi.mocked(GoogleGenAI).mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockResolvedValue({ text: '["你好"]' }) } };
    } as any);
    try {
      const result = await translateViaChain(["hello"], "en", "zh");
      expect(result.provider).toBe("gemini-3.5-flash");
      expect(result.translations).toEqual(["你好"]);
      expect(result.degradedFrom).toHaveLength(1);
      expect(result.degradedFrom?.[0]).toContain("deepseek-v4-flash");
    } finally {
      process.env.DEEPSEEK_API_KEY = saved.DEEPSEEK_API_KEY;
      process.env.GEMINI_API_KEY = saved.GEMINI_API_KEY;
      vi.unstubAllGlobals();
    }
  });
});

// ─── protectTerms（术语占位符掩码）───────────────────────────────────
describe("protectTerms", () => {
  it("does not mask all-letter hyphenated words", () => {
    // 纯字母连字符词（如 NON-GMO）不是参考号，掩码会导致语义丢失
    const { masked } = protectTerms("Certified NON-GMO soybean supply");
    expect(masked).toContain("NON-GMO");
  });

  it("still masks reference numbers", () => {
    const { tokens } = protectTerms("Tender RFQ-2026-0042 open");
    expect(tokens).toContain("RFQ-2026-0042");
  });
});

// ─── runIncrementalTranslation（定时扫描）───────────────────────
describe("runIncrementalTranslation", () => {
  it("writes skip-same-lang marker instead of rescanning", async () => {
    // 源语言=目标语言（zh→zh）：写标记行让 t.id IS NULL 扫描条件跳过，不调翻译链
    vi.mocked(detectSourceLang).mockReturnValue("zh");
    vi.mocked(translateNoticeViaChain).mockReset();
    const dbPool = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (String(sql).includes("FROM crm_translation_state")) return [[]];
        if (String(sql).includes("FROM crm_bid_opportunities")) return [[]];
        if (String(sql).includes("FROM crm_bid_notices")) {
          return params?.[0] === "zh" ? [[{ id: 5, title: "采购水泵" }]] : [[]];
        }
        return [{}];
      }),
    };
    await runIncrementalTranslation(dbPool as any, {
      maxPerRun: 10,
      descMaxChars: 8000,
      dailyCharBudget: 100000,
    });
    const markerCalls = dbPool.query.mock.calls.filter(
      ([, params]) => Array.isArray(params) && params[0] === 5 && params[1] === "zh",
    );
    expect(markerCalls).toHaveLength(1);
    expect(String(markerCalls[0][0])).toContain("skip-same-lang");
    expect(translateNoticeViaChain).not.toHaveBeenCalled();
  });

  it("scans crm_bid_opportunities and writes into crm_opportunity_translations", async () => {
    // 精选数据表同轮扫描：法语标题 → zh 目标语言翻译入独立缓存表
    vi.mocked(detectSourceLang).mockReturnValue("fr");
    vi.mocked(translateNoticeViaChain).mockReset();
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["水泵供应"], provider: "youdao-llm",
    });
    const dbPool = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (String(sql).includes("FROM crm_translation_state")) return [[]];
        if (String(sql).includes("FROM crm_bid_notices")) return [[]];
        if (String(sql).includes("FROM crm_bid_opportunities")) {
          return params?.[0] === "zh" ? [[{ id: 9, title: "Fourniture de pompes" }]] : [[]];
        }
        return [{}];
      }),
    };
    await runIncrementalTranslation(dbPool as any, {
      maxPerRun: 10,
      descMaxChars: 8000,
      dailyCharBudget: 100000,
    });
    const inserts = dbPool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("INSERT INTO crm_opportunity_translations"),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][0]).toBe(9);
    expect(inserts[0][1][1]).toBe("zh");
    expect(inserts[0][1][2]).toBe("水泵供应");
  });
});

// ─── fetchWithTimeout ────────────────────────────────────────────────────
describe("fetchWithTimeout", () => {
  it("aborts after the deadline with CHANNEL_TIMEOUT", async () => {
    vi.useFakeTimers();
    const never = new Promise<Response>(() => {});
    vi.stubGlobal("fetch", vi.fn(() => never));
    const p = fetchWithTimeout("https://x", {}, 5000);
    const assertion = expect(p).rejects.toThrow("CHANNEL_TIMEOUT");
    vi.advanceTimersByTime(5001);
    await assertion;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves normally before the deadline", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true } as Response)));
    const res = await fetchWithTimeout("https://x", {}, 5000);
    expect(res.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("passes through non-timeout fetch errors", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNRESET"))));
    await expect(fetchWithTimeout("https://x", {}, 5000)).rejects.toThrow("ECONNRESET");
    vi.unstubAllGlobals();
  });
});

// ─── hashPassword ───────────────────────────────────────────────────────────
describe("hashPassword", () => {
  it("produces consistent SHA-256 hex hash", () => {
    const hash1 = hashPassword("test123");
    const hash2 = hashPassword("test123");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("produces different hashes for different passwords", () => {
    expect(hashPassword("abc")).not.toBe(hashPassword("def"));
  });

  it("is not plaintext", () => {
    expect(hashPassword("mypassword")).not.toBe("mypassword");
  });
});

// ─── normalizeNoticeDetailPayload ───────────────────────────────────────────
describe("normalizeNoticeDetailPayload", () => {
  const baseNotice = {
    id: 1,
    notice_id: "N-001",
    reference: "REF-001",
    title: "Original Title",
    notice_type: "Tender",
    agency: "Agency A",
    organization: "Org B",
    country: "Brazil",
    deadline: "2026-08-01",
    deadline_ts: 1785000000,
    estimated_value: "BRL 100000",
    description: "Original description",
    contacts: JSON.stringify([{ name: "John", email: "j@x.com" }]),
    documents: JSON.stringify([{ url: "http://a.com/f.pdf", name: "F" }]),
    procurement_files: null,
    external_links: null,
    unspsc_codes: JSON.stringify([{ code: "8010", name: "Mgmt" }]),
    url: "http://source.com",
    converted_opp_id: null,
  };

  it("returns notice data with core_locked=false when unlocked", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" });
    expect(result.core_locked).toBe(false);
    expect(result.unlock_type).toBe("free");
  });

  it("prefers opportunity fields over notice when available", () => {
    const opportunity = {
      id: 10,
      title: "Opp Title",
      reference: "OPP-REF",
      notice_type: "RFP",
      country: "USA",
      deadline: "2026-09-01",
      deadline_ts: 1788000000,
      estimated_value: "USD 200000",
      description: "Opp description",
      agency: "Opp Agency",
      agency_full: "Opp Full Agency",
      source_url: "http://opp.com",
      contacts: [{ name: "Jane", email: "jane@x.com" }],
      documents: [{ url: "http://opp.com/doc.pdf", name: "OppDoc" }],
      external_links: null,
      unspsc_codes: [{ code: "7210", name: "Construction" }],
      is_qualified: 1,
      status: "won",
      audit_status: 1,
      review_status: "approved",
      priority: "high",
    };
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "single" }, opportunity);
    expect(result.title).toBe("Opp Title");
    expect(result.reference).toBe("OPP-REF");
    expect(result.agency).toBe("Opp Full Agency");
    expect(result.source_url).toBe("http://opp.com");
    expect(result.opportunity_info).not.toBeNull();
    expect(result.opportunity_info.id).toBe(10);
  });

  it("falls back to notice fields when opportunity is null", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" }, null);
    expect(result.title).toBe("Original Title");
    expect(result.agency).toBe("Agency A");
    expect(result.opportunity_info).toBeNull();
  });

  it("normalizes documents and removes procurement_files", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" });
    expect(result.procurement_files).toEqual([]);
    expect(Array.isArray(result.documents)).toBe(true);
  });

  it("includes core_info block", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" });
    expect(result.core_info).toBeDefined();
    expect(result.core_info.notice_id).toBe("N-001");
    expect(result.core_info.agency).toBe("Agency A");
  });
});

// ─── findQualifiedOpportunityForNotice ──────────────────────────────────────
describe("findQualifiedOpportunityForNotice", () => {
  it("returns null when no qualified opportunity found", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    const notice = { converted_opp_id: null, notice_id: null, reference: null };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toBeNull();
  });

  it("searches by converted_opp_id first", async () => {
    const opp = { id: 5, title: "Found Opp", is_qualified: 1 };
    const dbPool = { query: vi.fn().mockResolvedValue([[opp]]) };
    const notice = { converted_opp_id: 5, notice_id: "N1", reference: "R1" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toEqual(opp);
    expect(dbPool.query).toHaveBeenCalledTimes(1);
    expect(dbPool.query.mock.calls[0][0]).toContain("WHERE id = ?");
  });

  it("falls back to source_notice_id search", async () => {
    const opp = { id: 8, title: "By Notice ID" };
    const dbPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[]]) // converted_opp_id miss
        .mockResolvedValueOnce([[opp]]), // source_notice_id hit
    };
    const notice = { converted_opp_id: 99, notice_id: "N-123", reference: "R-1" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toEqual(opp);
    expect(dbPool.query).toHaveBeenCalledTimes(2);
  });

  it("falls back to reference search when title is similar", async () => {
    const opp = { id: 12, title: "Water Pump Procurement Project" };
    const dbPool = {
      query: vi.fn().mockResolvedValueOnce([[opp]]), // reference hit
    };
    // converted_opp_id=0 skips first check, notice_id=null skips second, only reference queried
    // [撞号防御 2026-07-31] reference 分支需标题相似度 >= 0.3 才命中
    const notice = { converted_opp_id: 0, notice_id: null, reference: "REF-XYZ", title: "Water Pump Procurement Project" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toEqual(opp);
    expect(dbPool.query).toHaveBeenCalledTimes(1);
    expect(dbPool.query.mock.calls[0][0]).toContain("WHERE reference = ?");
  });

  it("skips reference candidate when title similarity too low", async () => {
    const opp = { id: 13, title: "Solar Panel Installation Tender" };
    const dbPool = {
      query: vi.fn().mockResolvedValueOnce([[opp]]),
    };
    // 同 reference 但标题完全不相似 → 撞号防御过滤，返回 null
    const notice = { converted_opp_id: 0, notice_id: null, reference: "REF-XYZ", title: "Water Pump Procurement Project" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toBeNull();
  });
});

// ─── mapSupplierRow ─────────────────────────────────────────────────────────
describe("mapSupplierRow", () => {
  // supplier 表行形状（字段与 crm 旧表不同：company/products/contact/phone/...）
  const baseRow = {
    id: 1,
    company: "测试公司",
    country: "中国",
    country_code: "CN",
    province: "江苏",
    city: "苏州",
    contact: "张三",
    phone: "13812345678",
    email: "zhangsan@test.com",
    products: "产品A,产品B",
    industry: "制造业",
    type: "domestic",
  };

  it("maps DB row to Supplier DTO", () => {
    const result = mapSupplierRow(baseRow, null);
    expect(result.id).toBe("sup-db-1");
    expect(result.nameZh).toBe("测试公司");
    expect(result.industryZh).toBe("制造业");
    expect(result.mainProductsZh).toEqual(["产品A", "产品B"]);
    // 源码不再映射 certification 字段，合规标签恒为空数组
    expect(result.complianceLabelsZh).toEqual([]);
    expect(result.contactPerson).toBe("张三");
    expect(result.cityZh).toBe("苏州");
    expect(result.countryEn).toBe("China");
  });

  it("masks email and phone", () => {
    const result = mapSupplierRow(baseRow, null);
    expect(result.contactEmail).toContain("***");
    expect(result.contactPhone).toContain("****");
    expect(result.contactEmail).not.toBe("zhangsan@test.com");
  });

  it("uses translation when provided", () => {
    const tr = {
      industry_tr: "Manufacturing",
      main_products_tr: "Product A,Product B",
    };
    const result = mapSupplierRow(baseRow, tr);
    expect(result.industryEn).toBe("Manufacturing");
    expect(result.mainProductsEn).toEqual(["Product A", "Product B"]);
    expect(result.complianceLabelsEn).toEqual([]);
  });

  it("falls back to zh values when translation empty", () => {
    const tr = { industry_tr: "", main_products_tr: "" };
    const result = mapSupplierRow(baseRow, tr);
    expect(result.industryEn).toBe("制造业");
    expect(result.mainProductsEn).toEqual(["产品A", "产品B"]);
  });

  it("uses products first item as industry fallback", () => {
    const row = { ...baseRow, industry: "" };
    const result = mapSupplierRow(row, null);
    expect(result.industryZh).toBe("产品A");
  });
});
