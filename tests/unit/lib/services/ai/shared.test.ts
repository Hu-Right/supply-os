/**
 * AI 管线共享层测试
 * @module tests/unit/lib/services/ai/shared.test.ts
 * @description notice-context（公告上下文合并）与 llm-credentials（BYOK 配置解析）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findActiveByUser } = vi.hoisted(() => ({ findActiveByUser: vi.fn() }));

vi.mock("@/lib/repos/llm-config.repo", () => ({
  LlmConfigRepo: function (this: any) {
    Object.assign(this, { findActiveByUser });
  },
}));

vi.mock("@/lib/services/ai-summary/crypto", () => ({ decryptApiKey: vi.fn(() => "plain-key") }));

import { decryptApiKey } from "@/lib/services/ai-summary/crypto";
import { fetchNoticeContext } from "@/lib/services/ai/shared/notice-context";
import { resolveLlmCredentials } from "@/lib/services/ai/shared/llm-credentials";

const decryptMock = vi.mocked(decryptApiKey);

beforeEach(() => {
  vi.clearAllMocks();
  findActiveByUser.mockResolvedValue({ base_url: "https://x", api_key: "enc", model: "m" });
});

describe("fetchNoticeContext", () => {
  it("公告存在 → 合并机会表资格条件", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]])
        .mockResolvedValueOnce([[{ eligibility: "E", technical_hurdles: "TH", supplier_conditions: "SC" }]]),
    } as any;
    const ctx = await fetchNoticeContext(pool, 1);
    expect(ctx?.eligibility).toBe("E");
    expect(ctx?.technical_hurdles).toBe("TH");
    expect(ctx?.supplier_conditions).toBe("SC");
    expect(ctx?.title).toBe("T");
  });

  it("公告不存在 → null", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[]]) } as any;
    await expect(fetchNoticeContext(pool, 1)).resolves.toBeNull();
  });

  it("机会表无记录 → 资格条件为空串", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 1, title: "T" }]])
        .mockResolvedValueOnce([[]]),
    } as any;
    const ctx = await fetchNoticeContext(pool, 1);
    expect(ctx?.eligibility).toBe("");
    expect(ctx?.supplier_conditions).toBe("");
  });
});

describe("resolveLlmCredentials", () => {
  it("配置存在且解密成功 → 返回凭据（自定义端点落全默认档位）", async () => {
    const creds = await resolveLlmCredentials({} as any, 1);
    expect(creds).toEqual({
      baseUrl: "https://x", apiKey: "plain-key", model: "m",
      summaryTimeoutMs: 60_000, scoreTimeoutMs: 30_000, supportsTemperature: true,
    });
  });

  it("命中预置档位（v4-pro）→ 凭据挂载长档评分超时", async () => {
    findActiveByUser.mockResolvedValue({
      base_url: "https://api.deepseek.com", api_key: "enc", model: "deepseek-v4-pro",
    });
    const creds = await resolveLlmCredentials({} as any, 1);
    expect(creds.scoreTimeoutMs).toBe(90_000);
    expect(creds.supportsTemperature).toBe(true);
  });

  it("命中预置档位（gpt-6-astra）→ 标记不支持 temperature", async () => {
    findActiveByUser.mockResolvedValue({
      base_url: "https://api.openai.com/v1", api_key: "enc", model: "gpt-6-astra",
    });
    const creds = await resolveLlmCredentials({} as any, 1);
    expect(creds.supportsTemperature).toBe(false);
  });

  it("配置缺失 → 40001 errLlmNotConfigured", async () => {
    findActiveByUser.mockResolvedValue(null);
    await expect(resolveLlmCredentials({} as any, 1)).rejects.toMatchObject({ status: 400, code: 40001 });
  });

  it("解密失败 → 40001 errLlmNotConfigured", async () => {
    decryptMock.mockImplementationOnce(() => { throw new Error("bad key"); });
    await expect(resolveLlmCredentials({} as any, 1)).rejects.toMatchObject({ status: 400, code: 40001 });
  });
});
