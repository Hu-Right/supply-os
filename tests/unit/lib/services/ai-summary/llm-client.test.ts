import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseAiSummaryResponse,
  callLlmForSummary,
  callLlmForSummaryStream,
} from "@/lib/services/ai-summary/llm-client";

const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@/lib/services/translation/fetchWithTimeout", () => ({ fetchWithTimeout }));

const okRes = (body: unknown) => ({ ok: true, json: async () => body, body: {} });

describe("parseAiSummaryResponse", () => {
  it("解析标准 JSON 对象", () => {
    const content = JSON.stringify({
      coreDeliverables: "A", keyQualifications: "B",
      paymentCycle: "C", riskAlerts: "D",
    });
    const r = parseAiSummaryResponse(content);
    expect(r.coreDeliverables).toBe("A");
    expect(r.riskAlerts).toBe("D");
  });

  it("剥离 markdown 代码围栏后解析", () => {
    const content = "```json\n{\"coreDeliverables\":\"A\",\"keyQualifications\":\"B\",\"paymentCycle\":\"C\",\"riskAlerts\":\"D\"}\n```";
    expect(parseAiSummaryResponse(content).coreDeliverables).toBe("A");
  });

  it("从混合文本中提取首个 JSON 对象", () => {
    const content = "分析如下：{\"coreDeliverables\":\"A\",\"keyQualifications\":\"B\",\"paymentCycle\":\"C\",\"riskAlerts\":\"D\"} 完毕";
    expect(parseAiSummaryResponse(content).keyQualifications).toBe("B");
  });

  it("缺失字段以空串兜底", () => {
    const content = JSON.stringify({ coreDeliverables: "A" });
    const r = parseAiSummaryResponse(content);
    expect(r.coreDeliverables).toBe("A");
    expect(r.riskAlerts).toBe("");
  });

  it("非字符串字段值（数字/对象）→ 空串兜底", () => {
    const r = parseAiSummaryResponse(JSON.stringify({
      coreDeliverables: 123, keyQualifications: { nested: true },
    }));
    expect(r.coreDeliverables).toBe("");
    expect(r.keyQualifications).toBe("");
  });

  it("非法 JSON 抛错", () => {
    expect(() => parseAiSummaryResponse("not json at all")).toThrow();
  });

  it("文本中无任何 JSON 对象 → LLM_BAD_JSON", () => {
    expect(() => parseAiSummaryResponse("只是普通文本")).toThrow("LLM_BAD_JSON");
  });

  it("提取到的片段仍是坏 JSON → LLM_BAD_JSON", () => {
    expect(() => parseAiSummaryResponse("前缀 {not-valid-json} 后缀")).toThrow("LLM_BAD_JSON");
  });

  it("解析结果为 null/数字 → LLM_BAD_SHAPE", () => {
    expect(() => parseAiSummaryResponse("null")).toThrow("LLM_BAD_SHAPE");
    expect(() => parseAiSummaryResponse("42")).toThrow("LLM_BAD_SHAPE");
  });
});

describe("callLlmForSummary 非流式调用", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功：返回解析数据与 usage tokens，baseUrl 去尾斜杠", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({
      choices: [{ message: { content: JSON.stringify({ coreDeliverables: "A" }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }));
    const r = await callLlmForSummary(
      { baseUrl: "https://api.example.com///", apiKey: "k", model: "m" },
      "sys", "user",
    );
    expect(r.data.coreDeliverables).toBe("A");
    expect(r.inputTokens).toBe(100);
    expect(r.outputTokens).toBe(20);
    expect(r.model).toBe("m");
    const url = fetchWithTimeout.mock.calls[0][0] as string;
    expect(url).toBe("https://api.example.com/chat/completions");
  });

  it("usage 缺失 → tokens 为 null", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({
      choices: [{ message: { content: JSON.stringify({ coreDeliverables: "A" }) } }],
    }));
    const r = await callLlmForSummary({ baseUrl: "https://x", apiKey: "k", model: "m" }, "s", "u");
    expect(r.inputTokens).toBeNull();
    expect(r.outputTokens).toBeNull();
  });

  it("HTTP 非 2xx → LLM_HTTP_<status>", async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 503 });
    await expect(callLlmForSummary({ baseUrl: "https://x", apiKey: "k", model: "m" }, "s", "u"))
      .rejects.toThrow("LLM_HTTP_503");
  });

  it("空内容 → LLM_EMPTY", async () => {
    fetchWithTimeout.mockResolvedValue(okRes({ choices: [{ message: { content: "  " } }] }));
    await expect(callLlmForSummary({ baseUrl: "https://x", apiKey: "k", model: "m" }, "s", "u"))
      .rejects.toThrow("LLM_EMPTY");
  });
});

describe("callLlmForSummaryStream 流式调用", () => {
  const sseRes = (chunks: string[]) => {
    const encoder = new TextEncoder();
    let i = 0;
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => (i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined }),
        }),
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("逐块 yield content，[DONE] 终止，非法行跳过", async () => {
    fetchWithTimeout.mockResolvedValue(sseRes([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      ": keep-alive\n\n",
      'data: not-json\n\n',
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n',
      'data: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"不应出现"}}]}\n\n',
    ]));
    const out: string[] = [];
    for await (const chunk of callLlmForSummaryStream({ baseUrl: "https://x/", apiKey: "k", model: "m" }, "s", "u")) {
      out.push(chunk);
    }
    expect(out.join("")).toBe("你好");
  });

  it("流自然结束（无 [DONE]）也正常返回", async () => {
    fetchWithTimeout.mockResolvedValue(sseRes([
      'data: {"choices":[{"delta":{"content":"尾部"}}]}\n\n',
    ]));
    const out: string[] = [];
    for await (const chunk of callLlmForSummaryStream({ baseUrl: "https://x", apiKey: "k", model: "m" }, "s", "u")) {
      out.push(chunk);
    }
    expect(out.join("")).toBe("尾部");
  });

  it("HTTP 非 2xx → LLM_HTTP_<status>", async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });
    await expect(async () => {
      for await (const _ of callLlmForSummaryStream({ baseUrl: "https://x", apiKey: "k", model: "m" }, "s", "u")) {
        void _;
      }
    }).rejects.toThrow("LLM_HTTP_500");
  });

  it("响应无 body → LLM_NO_BODY", async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, body: null });
    await expect(async () => {
      for await (const _ of callLlmForSummaryStream({ baseUrl: "https://x", apiKey: "k", model: "m" }, "s", "u")) {
        void _;
      }
    }).rejects.toThrow("LLM_NO_BODY");
  });
});
