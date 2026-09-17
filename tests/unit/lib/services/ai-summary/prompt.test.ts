import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_PROMPT, truncate } from "@/lib/services/ai-summary/prompt";

describe("prompt builder", () => {
  it("SYSTEM_PROMPT 要求输出 4 字段 JSON", () => {
    expect(SYSTEM_PROMPT).toContain("coreDeliverables");
    expect(SYSTEM_PROMPT).toContain("riskAlerts");
  });

  it("组装包含公告与供应商信息", () => {
    const p = buildUserPrompt(
      { title: "采购笔记本电脑", agency: "UNDP", country: "KE", deadline: "2026-10-01", estimated_value: "50000", description: "需要500台", eligibility: "ISO9001", technical_hurdles: "", supplier_conditions: "" },
      { company: "华夏科技", industry: "IT", products: "笔记本", certification: "ISO9001", country: "CN", city: "深圳", type: "factory" },
    );
    expect(p).toContain("采购笔记本电脑");
    expect(p).toContain("华夏科技");
    expect(p).toContain("ISO9001");
  });

  it("供应商为 null 时省略企业画像段", () => {
    const p = buildUserPrompt(
      { title: "T", description: "D" },
      null,
    );
    expect(p).not.toContain("我的企业画像");
    expect(p).toContain("T");
  });

  it("描述超长被截断到 2000 字", () => {
    const long = "x".repeat(3000);
    const p = buildUserPrompt({ title: "T", description: long }, null);
    expect(p.length).toBeLessThan(3000);
  });

  it("truncate 处理边界", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdef", 3)).toBe("abc");
    expect(truncate("", 3)).toBe("");
  });
});
