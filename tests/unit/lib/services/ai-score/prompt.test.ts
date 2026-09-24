/**
 * AI 适配评分 Prompt 模板测试
 * @module tests/unit/lib/services/ai-score/prompt.test.ts
 * @description 动态权重分支 + 用户提示词组装（画像缺失/完整/v2 能力诊断）+ self/candidate 视角，
 *              并钉住「v2 诊断 19 列除意向题外全部进入维度判据」的结构不重不漏约束。
 */
import { describe, it, expect } from "vitest";
import {
  getDimensionWeights, buildScoreUserPrompt, DIMENSION_V2_SOURCES, SCORE_DIMENSIONS,
} from "@/lib/services/ai-score/prompt";
import { DIAGNOSIS_COLUMNS } from "@/shared/constants/diagnosis-dimensions";

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

  /** 画像：基本信息 + v2 诊断列（列名与 crm_supplier_diagnosis 一致） */
  const supplier = {
    company: "工厂A", industry: "电子", products: "LED", certification: "ISO9001",
    country: "CN", city: "深圳", type: "工厂", registered_capital: "500万",
    established_at: "2010-01-01", intro: "简介文本",
    ungm_status: "已注册一级(Level 1)", compliance_governance: "有专岗",
    english_evidence_level: "有英文检测报告或业绩证明", english_meeting_capability: "可独立参与视频澄清会",
    tender_experience: "有中标记录", tender_amount_band: "50万至200万美元", technical_response: "有专用响应模板与案例库",
    mandatory_docs: "ISO体系证书,原产地证",
    deliver_to_site: "可直接发货至项目国", service_countries: "DE", overseas_companies: "无",
    export_scale: "500-2000万美元", team_discipline: "1至2人有台账", procurement_frameworks: "UNGM 联合国采购门户",
    submission_control: "双人复核",
    cost_pricing: "含汇率物流与账期资金成本", incoterms_capability: "三种贸易条款都会", payment_terms: "可以",
    bid_willingness: "是",
  };

  /** 做过诊断但 19 题全部未答的画像（诊断列全空） */
  const blankDiagnosis = Object.fromEntries(DIAGNOSIS_COLUMNS.map((c) => [c, ""]));

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

  it("诊断列全空 → 明确标注未填写，不拿空串当事实", () => {
    const p = buildScoreUserPrompt(notice, { ...supplier, ...blankDiagnosis });
    expect(p).toContain("未填写诊断表");
    expect(p).toContain("保守分");
  });

  it("部分作答 → 已答题输出取值、未答题标为「未答」，且不再出现 v2 不存在的旧字段标签", () => {
    const p = buildScoreUserPrompt(notice, { ...supplier, ...blankDiagnosis, export_scale: "800万" });
    expect(p).toContain("出口/国际业务规模=800万");
    expect(p).toContain("UNGM注册=未答");
    expect(p).not.toContain("员工规模");
    expect(p).not.toContain("国际化能力");
  });

  it("逐维度打印判据，维度名与字段可对应", () => {
    const p = buildScoreUserPrompt(notice, supplier);
    expect(p).toContain("资质与合规（qualification）依据：UNGM注册=已注册一级(Level 1)");
    expect(p).toContain("强制文件覆盖（certification）依据：可即时提供的强制文件=ISO体系证书,原产地证");
    expect(p).toContain("背景（不计分）：参与公采投标意愿=是");
  });
});

describe("v2 诊断列与 7 维度判据的结构闭合", () => {
  it("除意向题外，19 列不重不漏地各被一个维度引用一次", () => {
    const used = SCORE_DIMENSIONS.flatMap((dim) => [...DIMENSION_V2_SOURCES[dim]]);
    const expected = DIAGNOSIS_COLUMNS.filter((c) => c !== "bid_willingness");

    expect(new Set(used).size).toBe(used.length); // 同一列不得驱动两个维度
    expect([...expected].sort()).toEqual([...used].sort()); // 加题后漏挂 prompt 会在此报错
    expect(expected).toHaveLength(18);
  });

  it("判据列名必须是真实诊断列（防手打错列名后静默失联）", () => {
    for (const dim of SCORE_DIMENSIONS) {
      for (const column of DIMENSION_V2_SOURCES[dim]) {
        expect(DIAGNOSIS_COLUMNS).toContain(column);
      }
    }
  });
});

describe("buildScoreUserPrompt perspective 视角切换", () => {
  const notice = { title: "T", notice_type: "RFQ", country: "CN", estimated_value: 1, deadline: "d", eligibility: "", technical_hurdles: "", supplier_conditions: "" };
  const supplier = { company: "某公司", industry: "电子", products: "P" };

  it("默认 self 视角使用「我的企业画像」与第一人称指令", () => {
    const p = buildScoreUserPrompt(notice, supplier);
    expect(p).toContain("我的企业画像");
    expect(p).toContain("评估我参与本标的适配度");
    expect(p).not.toContain("候选供应商画像");
  });

  it("candidate 视角使用「候选供应商画像」与第三人称指令", () => {
    const p = buildScoreUserPrompt(notice, supplier, "candidate");
    expect(p).toContain("候选供应商画像");
    expect(p).toContain("评估该供应商承接本标的的适配度");
    expect(p).not.toContain("我的企业画像");
  });
});
