/**
 * LLM 模型参数档位纯函数测试
 * @module tests/unit/lib/services/ai-summary/llm-profile.test.ts
 * @description resolveLlmProfile：预置命中/归一化/自定义兜底；预置档位数据契约。
 */
import { describe, it, expect } from "vitest";
import {
  resolveLlmProfile,
  DEFAULT_SUMMARY_TIMEOUT_MS,
  DEFAULT_SCORE_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
} from "@/lib/services/ai-summary/llm-profile";
import { PRESET_LLM_MODELS } from "@/lib/services/ai-summary/config";

describe("resolveLlmProfile 预置命中", () => {
  it("deepseek-flash：全默认档位且支持 temperature", () => {
    const p = resolveLlmProfile("https://api.deepseek.com", "deepseek-flash");
    expect(p).toEqual({
      summaryTimeoutMs: DEFAULT_SUMMARY_TIMEOUT_MS,
      scoreTimeoutMs: DEFAULT_SCORE_TIMEOUT_MS,
      supportsTemperature: true,
    });
  });

  it("推理旗舰（v4-pro / kimi-k3 / glm-5.3 / qwen3.8-max）评分超时长档", () => {
    for (const [baseUrl, model] of [
      ["https://api.deepseek.com", "deepseek-v4-pro"],
      ["https://api.moonshot.cn/v1", "kimi-k3"],
      ["https://open.bigmodel.cn/api/paas/v4", "glm-5.3"],
      ["https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3.8-max"],
    ]) {
      expect(resolveLlmProfile(baseUrl, model).scoreTimeoutMs).toBe(90_000);
    }
  });

  it("gpt-6-astra：不支持 temperature 且评分超时最长", () => {
    const p = resolveLlmProfile("https://api.openai.com/v1", "gpt-6-astra");
    expect(p.supportsTemperature).toBe(false);
    expect(p.scoreTimeoutMs).toBe(120_000);
  });
});

describe("resolveLlmProfile 归一化", () => {
  it("末尾斜杠与大小写不敏感", () => {
    const p = resolveLlmProfile("https://API.DeepSeek.COM/", "DeepSeek-Flash");
    expect(p.scoreTimeoutMs).toBe(DEFAULT_SCORE_TIMEOUT_MS);
    expect(p.supportsTemperature).toBe(true);
  });
});

describe("resolveLlmProfile 自定义端点兜底", () => {
  it("未命中预置 → 全默认（与档位化之前的历史行为一致）", () => {
    const p = resolveLlmProfile("https://my-gateway.example.com/v1", "my-model-x");
    expect(p).toEqual({
      summaryTimeoutMs: DEFAULT_SUMMARY_TIMEOUT_MS,
      scoreTimeoutMs: DEFAULT_SCORE_TIMEOUT_MS,
      supportsTemperature: true,
    });
  });

  it("baseUrl 或 model 为空 → 全默认", () => {
    expect(resolveLlmProfile("", "deepseek-flash").scoreTimeoutMs).toBe(DEFAULT_SCORE_TIMEOUT_MS);
    expect(resolveLlmProfile("https://api.deepseek.com", "  ").summaryTimeoutMs).toBe(
      DEFAULT_SUMMARY_TIMEOUT_MS,
    );
  });
});

describe("预置档位数据契约", () => {
  it("预置清单非空且探测超时常量合理", () => {
    expect(PRESET_LLM_MODELS.length).toBeGreaterThan(0);
    expect(PROBE_TIMEOUT_MS).toBeLessThan(DEFAULT_SCORE_TIMEOUT_MS);
  });

  it("每条预置均带 OpenAI 兼容 baseUrl 与 model（档位反查依赖）", () => {
    for (const p of PRESET_LLM_MODELS) {
      expect(p.baseUrl).toMatch(/^https:\/\//);
      expect(p.model).toBeTruthy();
    }
  });
});
