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

  it("描述超长被截断到 4000 字", () => {
    const long = "x".repeat(5000);
    const p = buildUserPrompt({ title: "T", description: long }, null);
    expect(p.length).toBeLessThan(6000);
  });

  it("truncate 处理边界", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdef", 3)).toBe("abc");
    expect(truncate("", 3)).toBe("");
  });
});

describe("buildUserPrompt 分支覆盖", () => {
  const notice = {
    title: "T", notice_type: "RFQ", agency: "UNDP", country: "KE",
    deadline: "2026-10-01", estimated_value: "50000",
    description: "需要500台", eligibility: "ISO9001",
    technical_hurdles: "", supplier_conditions: "",
  };

  const fullSupplier = {
    company: "华夏科技", industry: "IT", products: "笔记本", certification: "ISO9001",
    country: "CN", city: "深圳", type: "factory", employee_count: "100",
    intro: "公司简介", export_scale: "800万", service_countries: "KE",
    overseas_companies: "无", ungm_status: "已注册", english_team: "有", payment_terms: "接受",
  };

  it("description_cn 优先于 description", () => {
    const p = buildUserPrompt({ ...notice, description_cn: "中文描述", description: "english desc" }, null);
    expect(p).toContain("中文描述");
    expect(p).not.toContain("english desc");
  });

  it("description 与 description_cn 均缺失 → 输出（无）", () => {
    const p = buildUserPrompt({ ...notice, description: undefined, description_cn: undefined }, null);
    expect(p).toContain("（无）");
  });

  it("agency_full 存在时优先于 agency", () => {
    const p = buildUserPrompt({ ...notice, agency_full: "联合国开发计划署", agency: "UNDP" }, null);
    expect(p).toContain("联合国开发计划署");
  });

  it("attachments_text 存在 → 输出附件内容摘要段", () => {
    const p = buildUserPrompt({ ...notice, attachments_text: "附件正文" }, null);
    expect(p).toContain("附件内容摘要");
    expect(p).toContain("附件正文");
  });

  it("attachments_text 为空 → 不输出附件摘要段", () => {
    const p = buildUserPrompt(notice, null);
    expect(p).not.toContain("附件内容摘要");
  });

  it("supplier.company 为空串 → 走无画像分支", () => {
    const p = buildUserPrompt(notice, { ...fullSupplier, company: "" });
    expect(p).toContain("通用投标分析");
    expect(p).not.toContain("我的企业画像");
  });

  it("certification 缺失 → 兜底文案 未填写", () => {
    const p = buildUserPrompt(notice, { ...fullSupplier, certification: "" });
    expect(p).toContain("未填写");
  });

  it("无 intro → 不输出企业简介行", () => {
    const p = buildUserPrompt(notice, { ...fullSupplier, intro: "" });
    expect(p).not.toContain("企业简介");
  });

  it("国际化能力字段全空 → 不输出国际化能力行", () => {
    const s = { ...fullSupplier, export_scale: "", service_countries: "", overseas_companies: "", ungm_status: "", english_team: "", payment_terms: "" };
    const p = buildUserPrompt(notice, s);
    expect(p).not.toContain("国际化能力");
  });

  it("国际化能力部分存在 → 逐项输出", () => {
    const s = { ...fullSupplier, export_scale: "", service_countries: "KE,UG", overseas_companies: "", ungm_status: "", english_team: "", payment_terms: "" };
    const p = buildUserPrompt(notice, s);
    expect(p).toContain("服务国家: KE,UG");
    expect(p).not.toContain("出口规模");
  });
});
