/**
 * 翻译链 BYOK 单元测试
 *
 * 钉住 2026-11-18 口径：在线翻译使用**用户自己绑定的**大模型凭据
 * （baseUrl / apiKey / model），不再读平台 DEEPSEEK_API_KEY。
 * 覆盖：请求地址/鉴权头/模型选择、占位符保护与回填、thinking 字段按模型兼容、
 * 空凭据 → TRANSLATION_UNAVAILABLE。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchStub } = vi.hoisted(() => ({ fetchStub: vi.fn() }));
vi.mock("@/lib/services/translation/fetchWithTimeout", () => ({ fetchWithTimeout: fetchStub }));

import { protectTerms, translateViaChain, TranslationError, type TranslationCredentials } from "@/lib/services/translation/chain";

function okResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  } as unknown as Response;
}

const CREDS: TranslationCredentials = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "user-own-key-123",
  model: "deepseek-chat",
};

describe("translateViaChain（用户 BYOK 凭据）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("用用户凭据调用：地址 / Bearer / model 全部来自用户配置", async () => {
    fetchStub.mockResolvedValue(okResponse(["光伏电站施工"]));

    const result = await translateViaChain(["Construction of a solar park"], "en", "zh", CREDS);

    expect(result.provider).toBe("deepseek-chat");
    expect(result.translations).toEqual(["光伏电站施工"]);
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-own-key-123");
    const body = JSON.parse(String(init.body)) as { model: string; thinking?: unknown };
    expect(body.model).toBe("deepseek-chat");
    // DeepSeek 模型：关闭思考，避免把思考过程混进 JSON 数组
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("非 DeepSeek 模型不携带 thinking 字段（避免第三方端点 400）", async () => {
    fetchStub.mockResolvedValue(okResponse(["你好"]));
    await translateViaChain(["hello"], "en", "zh", { baseUrl: "https://api.openai.com/v1", apiKey: "sk-user", model: "gpt-4o-mini" });
    const body = JSON.parse(String((fetchStub.mock.calls[0] as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o-mini");
    expect(body).not.toHaveProperty("thinking");
  });

  it("术语占位符：URL / 参考号在请求中被打码，译文回填原文", async () => {
    // 模拟模型原样保留占位符（不翻译，直接回显输入）
    fetchStub.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
      const prompt = body.messages[0].content;
      const inputJson = prompt.slice(prompt.indexOf("Input: ") + 7, prompt.indexOf("\n\nOutput"));
      const inputs = JSON.parse(inputJson) as string[];
      return okResponse(inputs);
    });

    const source = "详见 https://example.com/tender 与参考号 RFQ-2026-0042";
    const masked = protectTerms(source);
    expect(masked.masked).not.toContain("https://example.com/tender");
    expect(masked.masked).not.toContain("RFQ-2026-0042");

    const result = await translateViaChain([source], "en", "zh", CREDS);
    // 请求里是占位符（不含原文 URL），回填后恢复原文
    const prompt = String(JSON.parse(String((fetchStub.mock.calls[0] as [string, RequestInit])[1].body)).messages[0].content);
    expect(prompt).not.toContain("https://example.com/tender");
    expect(prompt).toContain("⟦T0⟧");
    expect(result.translations[0]).toContain("https://example.com/tender");
    expect(result.translations[0]).toContain("RFQ-2026-0042");
  });

  it("空凭据 → TranslationError(TRANSLATION_UNAVAILABLE)，不发请求", async () => {
    await expect(
      translateViaChain(["hello"], "en", "zh", { baseUrl: "", apiKey: "", model: "" }),
    ).rejects.toBeInstanceOf(TranslationError);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("凭证 baseUrl 非 HTTPS 公网 → 拒绝出站（CHANNEL_URL_BLOCKED）", async () => {
    await expect(
      translateViaChain(["hello"], "en", "zh", { baseUrl: "http://127.0.0.1:8080", apiKey: "k", model: "m" }),
    ).rejects.toMatchObject({ degradedFrom: [expect.stringContaining("CHANNEL_URL_BLOCKED")] });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
