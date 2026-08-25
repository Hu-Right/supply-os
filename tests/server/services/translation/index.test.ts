/**
 * server/services/translation/ 单元测试
 * 覆盖 chain.ts (protectTerms), notice.ts (detectSourceLang),
 *       fetchWithTimeout.ts, auto.ts (readAutoTranslateConfig),
 *       logCleanup.ts (markTranslationSuccess/flushCleanedLogs)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ── chain.ts: protectTerms ──
import { protectTerms } from "../../../../server/services/translation/chain";

describe("protectTerms (chain.ts)", () => {
  it("提取 URL 为占位符", () => {
    const { masked, tokens } = protectTerms("Visit https://example.com for details");
    expect(tokens).toContain("https://example.com");
    expect(masked).not.toContain("https://example.com");
    expect(masked).toContain("⟦T0⟧");
  });

  it("提取邮箱为占位符", () => {
    const { masked, tokens } = protectTerms("Contact user@example.com for help");
    expect(tokens).toContain("user@example.com");
    expect(masked).toContain("⟦T0⟧");
  });

  it("提取参考号（含数字）为占位符", () => {
    const { masked, tokens } = protectTerms("Ref: RFQ-2026-0042 is pending");
    expect(tokens).toContain("RFQ-2026-0042");
    expect(masked).toContain("⟦T0⟧");
  });

  it("提取常见缩写（UNGM/RFQ/ITB 等）为占位符", () => {
    const { masked, tokens } = protectTerms("Register on UNGM and submit RFQ");
    expect(tokens).toContain("UNGM");
    expect(tokens).toContain("RFQ");
  });

  it("纯字母词（NON-GMO）不被参考号正则误掩码", () => {
    const { tokens } = protectTerms("This is NON-GMO certified");
    // NON-GMO 不含数字，不应匹配参考号模式
    expect(tokens).not.toContain("NON-GMO");
  });

  it("多个术语同时掩码", () => {
    const { masked, tokens } = protectTerms("See https://a.com and mail b@c.com ref RFQ-001");
    expect(tokens.length).toBe(3);
    expect(masked).toContain("⟦T0⟧");
    expect(masked).toContain("⟦T1⟧");
    expect(masked).toContain("⟦T2⟧");
  });

  it("无匹配术语时原文不变", () => {
    const { masked, tokens } = protectTerms("Simple procurement text");
    expect(tokens.length).toBe(0);
    expect(masked).toBe("Simple procurement text");
  });
});

// ── notice.ts: detectSourceLang ──
import { detectSourceLang, NOTICE_TRANSLATION_LANGS } from "../../../../server/services/translation/notice";

describe("detectSourceLang (notice.ts)", () => {
  it("中文文本返回 zh", () => {
    expect(detectSourceLang("采购公告", "中国政府采购网")).toBe("zh");
  });

  it("英文文本返回 en", () => {
    expect(detectSourceLang("Request for Quotation", "Procurement of office supplies")).toBe("en");
  });

  it("俄语文本返回 ru", () => {
    expect(detectSourceLang("Закупка оборудования", "Поставка серверов")).toBe("ru");
  });

  it("阿拉伯语文本返回 ar", () => {
    expect(detectSourceLang("مناقصة عامة", "توريد معدات")).toBe("ar");
  });

  it("纯数字/符号返回 null", () => {
    expect(detectSourceLang("12345", "!!!")).toBeNull();
  });

  it("空文本返回 null", () => {
    expect(detectSourceLang("", "")).toBeNull();
  });

  it("法语文本返回 fr", () => {
    const result = detectSourceLang("Appel d'offres pour la fourniture", "de matériel informatique");
    // tinyld 应检测为 fr
    expect(result).toBe("fr");
  });
});

describe("NOTICE_TRANSLATION_LANGS", () => {
  it("包含 6 种目标语言", () => {
    expect(Object.keys(NOTICE_TRANSLATION_LANGS)).toEqual(["zh", "en", "fr", "ru", "es", "ar"]);
  });
});

// ── fetchWithTimeout.ts ──
import { fetchWithTimeout } from "../../../../server/services/translation/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("正常响应在超时前返回", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const res = await fetchWithTimeout("https://api.test.com", { method: "GET" }, 5000);
    expect(res.ok).toBe(true);
  });

  it("超时时抛出 CHANNEL_TIMEOUT", async () => {
    // fetch 永远不 resolve，触发超时
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    await expect(
      fetchWithTimeout("https://api.test.com", { method: "GET" }, 50)
    ).rejects.toThrow("CHANNEL_TIMEOUT");
  });

  it("fetch 抛出非超时错误时原样传播", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("NETWORK_ERROR"));
    await expect(
      fetchWithTimeout("https://api.test.com", { method: "GET" }, 5000)
    ).rejects.toThrow("NETWORK_ERROR");
  });
});

// ── auto.ts: readAutoTranslateConfig ──
import { readAutoTranslateConfig } from "../../../../server/services/translation/auto";

describe("readAutoTranslateConfig", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    for (const key of [
      "NOTICE_AUTO_TRANSLATE",
      "NOTICE_AUTO_TRANSLATE_MAX",
      "NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS",
      "NOTICE_AUTO_TRANSLATE_DAILY_CHARS",
    ]) {
      if (origEnv[key] === undefined) delete process.env[key];
      else process.env[key] = origEnv[key];
    }
  });

  it("默认值正确", () => {
    delete process.env.NOTICE_AUTO_TRANSLATE;
    delete process.env.NOTICE_AUTO_TRANSLATE_MAX;
    const cfg = readAutoTranslateConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxPerRun).toBe(50000);
    expect(cfg.descMaxChars).toBe(8000);
    expect(cfg.dailyCharBudget).toBe(7_000_000);
  });

  it("NOTICE_AUTO_TRANSLATE=off 禁用", () => {
    process.env.NOTICE_AUTO_TRANSLATE = "off";
    const cfg = readAutoTranslateConfig();
    expect(cfg.enabled).toBe(false);
  });

  it("自定义 maxPerRun 和 dailyCharBudget", () => {
    process.env.NOTICE_AUTO_TRANSLATE_MAX = "1000";
    process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS = "500000";
    const cfg = readAutoTranslateConfig();
    expect(cfg.maxPerRun).toBe(1000);
    expect(cfg.dailyCharBudget).toBe(500000);
  });
});

// ── logCleanup.ts ──
import {
  markTranslationSuccess,
  getCleanedLogCount,
  _resetLogCleanup,
} from "../../../../server/services/translation/logCleanup";

describe("logCleanup", () => {
  beforeEach(() => {
    _resetLogCleanup();
  });

  it("初始状态计数为 0", () => {
    expect(getCleanedLogCount()).toBe(0);
  });

  it("markTranslationSuccess 无索引时返回 0", () => {
    // 没有日志文件可扫描（测试环境），标记不匹配任何条目
    const count = markTranslationSuccess("crm_bid_notices", 999999, "zh");
    expect(count).toBe(0);
  });

  it("markTranslationSuccess 后 getCleanedLogCount 不变（无匹配索引）", () => {
    markTranslationSuccess("crm_bid_notices", 1, "en");
    // 无索引匹配，cleanedKeys 不增加
    expect(getCleanedLogCount()).toBe(0);
  });
});
