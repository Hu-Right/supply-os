/**
 * AI 适配评分 Prompt 模板测试
 * @module tests/unit/lib/services/ai-score/prompt.test.ts
 * @description 动态权重分支 + 用户提示词组装（画像缺失/完整/国际化能力）。
 */
import { describe, it, expect } from "vitest";
import { getDimensionWeights, buildScoreUserPrompt } from "@/lib/services/ai-score/prompt";

describe("getDimensionWeights 按公告类型动态调整", () => {
  it("工程类：资质 30% 最高", () => {
    const w = getDimensionWeights("工程施工类");
    expect(w.qualification).toBe(0.30);
    expect(w.region).toBe(0.20);
  });

  it("英文 construction 亦命中工程类权重", () => {
    expect(getDimensionWeights("Construction Works").qualification).toBe(0.30);
  });

  it("货物类：价格 25% 最高", () => {
    const w = getDimensionWeights("货物采购");
    expect(w.price).toBe(0.25);
    expect(getDimensionWeights("Goods Supply").price).toBe(0.25);
  });

  it("服务类：地域/资质 25% 最高", () => {
    const w = getDimensionWeights("咨询服务");
    expect(w.qualification).toBe(0.25);
    expect(w.region).toBe(0.25);
  });

  it("未知类型 → 通用权重", () => {
    const w = getDimensionWeights("其他类型");
    expect(w.qualification).toBe(0.20);
    expect(getDimensionWeights(undefined).qualification).toBe(0.20);
  });
});

describe("buildScoreUserPrompt 画像组装", () => {
  const notice = {
    title: "LED 采购", notice_type: "货物采购", country: "DE",
    estimated_value: "100万", deadline: "2026-10-01",
    eligibility: "ISO9001", technical_hurdles: "", supplier_conditions: "",
  };

  const supplier = {
    company: "工厂A", industry: "电子", products: "LED", certification: "ISO9001",
    country: "CN", city: "深圳", type: "工厂", registered_capital: "500万",
    established_at: "2010-01-01", intro: "简介文本",
    employee_count: "100人", export_scale: "1000万", service_countries: "DE",
    overseas_companies: "无", ungm_status: "已注册", english_team: "有",
    payment_terms: "接受", bid_willingness: "是",
  };

  it("无画像 → 通用基准分分支", () => {
    const p = buildScoreUserPrompt(notice, null);
    expect(p).toContain("未绑定企业画像");
  });

  it("画像 company 为空 → 走通用基准分分支", () => {
    const p = buildScoreUserPrompt(notice, { ...supplier, company: "  " });
    expect(p).toContain("未绑定企业画像");
  });

  it("完整画像 → 含企业画像与动态权重说明", () => {
    const p = buildScoreUserPrompt(notice, supplier);
    expect(p).toContain("我的企业画像");
    expect(p).toContain("工厂A");
    expect(p).toContain("综合分 = 加权平均");
    expect(p).toContain("25%"); // 货物类价格权重
  });

  it("画像无 intro → 不输出企业简介行", () => {
    const p = buildScoreUserPrompt(notice, { ...supplier, intro: "" });
    expect(p).not.toContain("企业简介");
  });

  it("国际化能力字段全部为空 → 不输出国际化能力行", () => {
    const s = { ...supplier, export_scale: "", service_countries: "", overseas_companies: "", ungm_status: "", english_team: "", payment_terms: "" };
    const p = buildScoreUserPrompt(notice, s);
    expect(p).not.toContain("国际化能力");
  });

  it("国际化能力部分缺失 → 仅输出已有项", () => {
    const s = { ...supplier, export_scale: "800万", service_countries: "", overseas_companies: "", ungm_status: "", english_team: "", payment_terms: "" };
    const p = buildScoreUserPrompt(notice, s);
    expect(p).toContain("出口规模: 800万");
    expect(p).not.toContain("UNGM:");
  });
});
