/**
 * AI 适配评分 LLM 客户端纯函数测试
 * @module tests/unit/lib/services/ai-score/llm-client.test.ts
 * @description parseAiScoreResponse：推理提取、JSON 容错解析、维度归一、结构化证据兼容。
 */
import { describe, it, expect } from "vitest";
import { parseAiScoreResponse } from "@/lib/services/ai-score/llm-client";

const baseJson = {
  qualification: 85, experience: 70, certification: 60, region: 90,
  scale: 75, delivery: 80, price: 65, overall: 75,
  details: {
    qualification: { reason: "r1", matched: ["m1"], gaps: ["g1"] },
  },
};

describe("parseAiScoreResponse 推理过程提取", () => {
  it("JSON 前的文本作为 reasoning 输出", () => {
    const content = "本标为工程类采购，资质权重较高。\n" + JSON.stringify(baseJson);
    const r = parseAiScoreResponse(content);
    expect(r.reasoning).toContain("工程类采购");
  });

  it("直接以 JSON 开头 → reasoning 为空", () => {
    const r = parseAiScoreResponse(JSON.stringify(baseJson));
    expect(r.reasoning).toBe("");
  });

  it("代码块包裹的前置文本 → 剥离 ``` 前缀后输出 reasoning", () => {
    const content = "```json\n分析：企业具备ISO9001。\n" + JSON.stringify(baseJson);
    const r = parseAiScoreResponse(content);
    expect(r.reasoning).toContain("分析");
    expect(r.reasoning).not.toContain("```");
  });
});

describe("parseAiScoreResponse JSON 容错", () => {
  it("非纯 JSON 文本 → 正则提取首个对象", () => {
    const content = "结论如下：{\"qualification\":1,\"experience\":2,\"certification\":3,\"region\":4,\"scale\":5,\"delivery\":6,\"price\":7,\"overall\":8}";
    const r = parseAiScoreResponse(content);
    expect(r.overall).toBe(8);
  });

  it("完全无法解析 → 抛 LLM_BAD_JSON", () => {
    expect(() => parseAiScoreResponse("not json at all")).toThrow("LLM_BAD_JSON");
  });

  it("解析结果非对象（null/数字）→ 抛 LLM_BAD_SHAPE", () => {
    expect(() => parseAiScoreResponse("123")).toThrow("LLM_BAD_SHAPE");
    expect(() => parseAiScoreResponse("null")).toThrow("LLM_BAD_SHAPE");
  });
});

describe("parseAiScoreResponse 分数归一", () => {
  it("越界分数钳制到 0-100，非法值兜底 50", () => {
    const r = parseAiScoreResponse(JSON.stringify({
      qualification: 120, experience: -5, certification: "abc", region: 3.7,
      scale: 0, delivery: 100, price: 50, overall: 75,
    }));
    expect(r.qualification).toBe(100);
    expect(r.experience).toBe(0);
    expect(r.certification).toBe(50);
    expect(r.region).toBe(4);
    expect(r.scale).toBe(0);
    expect(r.delivery).toBe(100);
  });
});

describe("parseAiScoreResponse 结构化证据", () => {
  it("details 格式：reason/matched/gaps 解析，matched 截断到 5 条", () => {
    const details: Record<string, { reason: string; matched: string[]; gaps: string[] }> = {};
    for (const k of ["qualification", "experience", "certification", "region", "scale", "delivery", "price"]) {
      details[k] = { reason: `${k}依据`, matched: ["1", "2", "3", "4", "5", "6", "7"], gaps: ["差距"] };
    }
    const r = parseAiScoreResponse(JSON.stringify({ ...baseJson, details }));
    expect(r.details.qualification.matched).toHaveLength(5);
    expect(r.details.price.reason).toBe("price依据");
  });

  it("旧格式 reasons 兜底：无 details 时 reason 回退到 reasons[k]", () => {
    const reasons: Record<string, string> = { qualification: "旧版依据" };
    const r = parseAiScoreResponse(JSON.stringify({ ...baseJson, details: undefined, reasons }));
    expect(r.details.qualification.reason).toBe("旧版依据");
    expect(r.details.experience.reason).toBe("");
  });

  it("matched/gaps 非数组 → 空数组兜底", () => {
    const details: Record<string, unknown> = {};
    for (const k of ["qualification", "experience", "certification", "region", "scale", "delivery", "price"]) {
      details[k] = { reason: "r", matched: "not-array", gaps: null };
    }
    const r = parseAiScoreResponse(JSON.stringify({ ...baseJson, details }));
    expect(r.details.qualification.matched).toEqual([]);
    expect(r.details.qualification.gaps).toEqual([]);
  });

  it("空字符串证据项被过滤", () => {
    const details: Record<string, unknown> = {};
    for (const k of ["qualification", "experience", "certification", "region", "scale", "delivery", "price"]) {
      details[k] = { reason: "r", matched: ["", "有效项"], gaps: [] };
    }
    const r = parseAiScoreResponse(JSON.stringify({ ...baseJson, details }));
    expect(r.details.qualification.matched).toEqual(["有效项"]);
  });
});
