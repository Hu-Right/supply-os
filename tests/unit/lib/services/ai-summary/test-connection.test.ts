/**
 * LLM 连接测试探测服务测试
 * @module tests/unit/lib/services/ai-summary/test-connection.test.ts
 * @description translateProbeError 中文映射；testLlmConnection 各失败路径折叠与请求体契约。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  translateProbeError,
  testLlmConnection,
} from "@/lib/services/ai-summary/test-connection";

const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@/lib/services/translation/fetchWithTimeout", () => ({ fetchWithTimeout }));

const okRes = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const errRes = (status: number, text = "") => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => text,
});

beforeEach(() => vi.clearAllMocks());

describe("translateProbeError", () => {
  it("常见厂商错误码均有专属中文提示", () => {
    expect(translateProbeError(401)).toContain("API Key 无效");
    expect(translateProbeError(403)).toContain("API Key 无效");
    expect(translateProbeError(402)).toContain("余额不足");
    expect(translateProbeError(404)).toContain("模型不存在");
    expect(translateProbeError(429)).toContain("频繁");
    expect(translateProbeError(400)).toContain("OpenAI 兼容");
  });

  it("未知状态码 → 通用兜底且携带状态码", () => {
    expect(translateProbeError(503)).toContain("503");
  });
});

describe("testLlmConnection 成功路径", () => {
  it("200 → ok:true，回显端点 model 与耗时", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({ model: "deepseek-flash-v4.1" }));
    const r = await testLlmConnection({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-x",
      model: "deepseek-flash",
    });
    expect(r.ok).toBe(true);
    expect(r.model).toBe("deepseek-flash-v4.1");
    expect(typeof r.latencyMs).toBe("number");
  });

  it("200 但响应无 model 字段 → 回退为请求 model", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({}));
    const r = await testLlmConnection({
      baseUrl: "https://x.example.com/v1",
      apiKey: "k",
      model: "custom-m",
    });
    expect(r.model).toBe("custom-m");
  });

  it("200 但响应体不是合法 JSON → 仍判成功，回退请求 model", async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad"); }, text: async () => "" });
    const r = await testLlmConnection({ baseUrl: "https://a.example.com/v1", apiKey: "k", model: "m" });
    expect(r.ok).toBe(true);
    expect(r.model).toBe("m");
  });

  it("请求体契约：max_tokens=1、末尾斜杠剥离、支持 temperature 的端点携带该参数", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({}));
    await testLlmConnection({
      baseUrl: "https://api.deepseek.com/",
      apiKey: "sk-x",
      model: "deepseek-flash",
    });
    const [url, init] = fetchWithTimeout.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const payload = JSON.parse(String(init.body));
    expect(payload.max_tokens).toBe(1);
    expect(payload.temperature).toBeDefined();
    expect(String(init.headers.Authorization)).toBe("Bearer sk-x");
  });

  it("档位不支持 temperature（gpt-6-astra）→ 请求体不携带该参数", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({}));
    await testLlmConnection({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-x",
      model: "gpt-6-astra",
    });
    const payload = JSON.parse(String(fetchWithTimeout.mock.calls[0][1].body));
    expect(payload.temperature).toBeUndefined();
  });
});

describe("testLlmConnection 失败路径折叠", () => {
  it("HTTP 401 → 中文提示且拼接厂商原始返回", async () => {
    fetchWithTimeout.mockResolvedValue(errRes(401, "invalid api key"));
    const r = await testLlmConnection({ baseUrl: "https://a.example.com/v1", apiKey: "k", model: "m" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("API Key 无效");
    expect(r.error).toContain("invalid api key");
  });

  it("HTTP 404 → 模型名提示", async () => {
    fetchWithTimeout.mockResolvedValue(errRes(404));
    const r = await testLlmConnection({ baseUrl: "https://a.example.com/v1", apiKey: "k", model: "m" });
    expect(r.error).toContain("模型不存在");
  });

  it("超时（CHANNEL_TIMEOUT）→ 秒数提示，不抛出", async () => {
    fetchWithTimeout.mockRejectedValue(new Error("CHANNEL_TIMEOUT"));
    const r = await testLlmConnection({ baseUrl: "https://a.example.com/v1", apiKey: "k", model: "m" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("连接超时");
    expect(r.error).toContain("15");
  });

  it("SSRF 拦截（CHANNEL_URL_BLOCKED）→ Base URL 提示", async () => {
    fetchWithTimeout.mockRejectedValue(new Error("CHANNEL_URL_BLOCKED"));
    const r = await testLlmConnection({ baseUrl: "http://127.0.0.1:8/v1", apiKey: "k", model: "m" });
    expect(r.error).toContain("Base URL 不合法");
  });

  it("网络层异常（TypeError）→ 无法连接提示", async () => {
    fetchWithTimeout.mockRejectedValue(new TypeError("fetch failed"));
    const r = await testLlmConnection({ baseUrl: "https://a.example.com/v1", apiKey: "k", model: "m" });
    expect(r.error).toContain("无法连接到端点");
  });

  it("抛出非 Error 对象 → String(err) 兜底不崩溃", async () => {
    fetchWithTimeout.mockRejectedValue("raw-string-failure");
    const r = await testLlmConnection({ baseUrl: "https://a.example.com/v1", apiKey: "k", model: "m" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("raw-string-failure");
  });
});
