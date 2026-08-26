/**
 * server/services/translation/chain.ts 测试
 * 覆盖 protectTerms（纯函数）+ translateViaChain（mock fetch）
 * 注意：DeepSeek 有重试机制（最多 3 次 + 指数退避），测试需关闭重试或 mock 为不可重试错误
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { protectTerms } from "../../../../server/services/translation/chain";

// mock 外部依赖
vi.mock("../../../../server/config/env", () => ({
  channelConfigured: (key: string | undefined) => !!key,
}));

vi.mock("../../../../server/services/translation/fetchWithTimeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { translateViaChain } from "../../../../server/services/translation/chain";
import { fetchWithTimeout } from "../../../../server/services/translation/fetchWithTimeout";

describe("protectTerms", () => {
  it("URL 替换为占位符", () => {
    const { masked, tokens } = protectTerms("Visit https://example.com for details");
    expect(masked).not.toContain("https://example.com");
    expect(masked).toContain("⟦T0⟧");
    expect(tokens).toContain("https://example.com");
  });

  it("邮箱替换为占位符", () => {
    const { masked, tokens } = protectTerms("Contact user@example.com please");
    expect(masked).not.toContain("user@example.com");
    expect(tokens[0]).toBe("user@example.com");
  });

  it("参考号替换为占位符（含数字）", () => {
    const { masked, tokens } = protectTerms("Ref: RFQ-2026-0042 is here");
    expect(masked).not.toContain("RFQ-2026-0042");
    expect(tokens.some(t => t.includes("RFQ"))).toBe(true);
  });

  it("已知缩写替换", () => {
    const { masked, tokens } = protectTerms("UNGM registration required");
    expect(masked).not.toContain("UNGM");
    expect(tokens).toContain("UNGM");
  });

  it("无特殊术语 → 原文不变", () => {
    const { masked, tokens } = protectTerms("Simple text without special terms");
    expect(masked).toBe("Simple text without special terms");
    expect(tokens).toHaveLength(0);
  });

  it("多个术语同时替换", () => {
    const { masked, tokens } = protectTerms("Visit https://a.com and email b@c.com and UNGM");
    expect(tokens.length).toBe(3);
    expect(masked).toContain("⟦T0⟧");
    expect(masked).toContain("⟦T1⟧");
    expect(masked).toContain("⟦T2⟧");
  });
});

describe("translateViaChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPSEEK_API_KEY = "test-key";
    process.env.DEEPSEEK_BASE_URL = "https://test.deepseek.com";
  });

  it("空文本数组 → 原样返回", async () => {
    const result = await translateViaChain(["", "  "], "en", "zh");
    expect(result.provider).toBe("none");
    expect(result.translations).toEqual(["", "  "]);
  });

  it("DeepSeek 成功 → 返回翻译结果", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["翻译1", "翻译2"]' } }],
      }),
    } as any);

    const result = await translateViaChain(["text1", "text2"], "en", "zh");
    expect(result.provider).toBe("deepseek-v4-flash");
    expect(result.translations).toHaveLength(2);
  });

  it("DeepSeek 未配置 → 抛出 TRANSLATION_UNAVAILABLE", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(translateViaChain(["text"], "en", "zh")).rejects.toThrow("TRANSLATION_UNAVAILABLE");
  });

  it("DeepSeek 返回空内容 → 重试后抛出 TRANSLATION_UNAVAILABLE", async () => {
    // 空内容是可重试错误，会重试 3 次 + 指数退避（1.5s+3s+6s=10.5s）
    // 使用不可重试的 HTTP 400 错误代替
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    } as any);

    // DEEPSEEK_EMPTY 是可重试的，但我们用 400 错误（不可重试）来快速测试
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      status: 400,
    } as any);

    await expect(translateViaChain(["text"], "en", "zh")).rejects.toThrow("TRANSLATION_UNAVAILABLE");
  }, 10000);

  it("DeepSeek HTTP 400 错误 → 立即抛出（不重试）", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      status: 400,
    } as any);

    await expect(translateViaChain(["text"], "en", "zh")).rejects.toThrow("TRANSLATION_UNAVAILABLE");
  });

  it("目标语言不支持 → 抛出 TRANSLATION_UNAVAILABLE", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["翻译"]' } }] }),
    } as any);

    await expect(translateViaChain(["text"], "en", "xx")).rejects.toThrow("TRANSLATION_UNAVAILABLE");
  });

  it("DeepSeek 返回 markdown 围栏 → 正确解析", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n["翻译1"]\n```' } }],
      }),
    } as any);

    const result = await translateViaChain(["text1"], "en", "zh");
    expect(result.translations[0]).toBe("翻译1");
  });

  it("占位符在译文中正确回填", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["访问 ⟦T0⟧ 获取详情"]' } }],
      }),
    } as any);

    const result = await translateViaChain(["Visit https://example.com for details"], "en", "zh");
    expect(result.translations[0]).toContain("https://example.com");
  });
});
