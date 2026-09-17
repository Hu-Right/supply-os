import { describe, it, expect } from "vitest";
import { parseAiSummaryResponse } from "@/lib/services/ai-summary/llm-client";

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

  it("非法 JSON 抛错", () => {
    expect(() => parseAiSummaryResponse("not json at all")).toThrow();
  });
});
