/**
 * server/services/translation/ 子模块测试
 * 覆盖 chain.ts (protectTerms), fetchWithTimeout.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── chain.ts — protectTerms ──
import { protectTerms } from "../../../../server/services/translation/chain";

describe("protectTerms", () => {
  it("URL → 替换为占位符", () => {
    const { masked, tokens } = protectTerms("Visit https://example.com for details");
    expect(masked).not.toContain("https://example.com");
    expect(masked).toContain("⟦T0⟧");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toBe("https://example.com");
  });

  it("邮箱 → 替换为占位符", () => {
    const { masked, tokens } = protectTerms("Contact user@example.com for info");
    expect(masked).not.toContain("user@example.com");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toBe("user@example.com");
  });

  it("参考号（含数字）→ 替换为占位符", () => {
    const { masked, tokens } = protectTerms("Ref: RFQ-2026-0042 is ready");
    expect(masked).not.toContain("RFQ-2026-0042");
    expect(tokens.length).toBeGreaterThanOrEqual(1);
  });

  it("已知缩写 → 替换为占位符", () => {
    const { masked, tokens } = protectTerms("Registered on UNGM platform");
    expect(masked).not.toContain("UNGM");
    expect(tokens.length).toBeGreaterThanOrEqual(1);
  });

  it("多个匹配 → 多个占位符递增编号", () => {
    const { masked, tokens } = protectTerms(
      "See https://example.com and email test@mail.com"
    );
    expect(tokens).toHaveLength(2);
    expect(masked).toContain("⟦T0⟧");
    expect(masked).toContain("⟦T1⟧");
  });

  it("无匹配 → 原文不变", () => {
    const { masked, tokens } = protectTerms("普通文本内容");
    expect(masked).toBe("普通文本内容");
    expect(tokens).toHaveLength(0);
  });

  it("纯字母缩写（如 NON-GMO）不掩码（参考号需含数字）", () => {
    const { tokens } = protectTerms("This is NON-GMO certified");
    // NON-GMO 不含数字，不应被参考号正则匹配
    const hasNonGmo = tokens.some((t) => t === "NON-GMO");
    expect(hasNonGmo).toBe(false);
  });
});

// ── fetchWithTimeout.ts ──
import { fetchWithTimeout } from "../../../../server/services/translation/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常响应 → 返回 Response", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    fetchSpy.mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout("https://api.example.com", {}, 5000);
    expect(result).toBe(mockResponse);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("超时 → 抛 CHANNEL_TIMEOUT", async () => {
    // fetch 永远不 resolve，让超时触发
    fetchSpy.mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    await expect(
      fetchWithTimeout("https://api.example.com", {}, 50)
    ).rejects.toThrow("CHANNEL_TIMEOUT");
  });

  it("fetch 抛异常 → 传播原始错误", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Network error"));

    await expect(
      fetchWithTimeout("https://api.example.com", {}, 5000)
    ).rejects.toThrow("Network error");
  });
});
