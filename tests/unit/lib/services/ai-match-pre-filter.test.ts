/**
 * AI 匹配候选粗筛（规则引擎）测试
 * @module tests/unit/lib/services/ai-match-pre-filter.test.ts
 * @description 纯函数验证：词项提取、公告语料拼接、重叠打分、粗筛排序与截断。
 */
import { describe, it, expect } from "vitest";
import {
  extractSupplierTerms,
  buildNoticeCorpus,
  scoreSupplierAgainstNotice,
  preFilterSuppliers,
  type PreFilterSupplier,
} from "@/lib/services/ai-match/pre-filter";

describe("extractSupplierTerms", () => {
  it("按中英文逗号/顿号/斜杠/分号/换行切词并去重、小写化", () => {
    const terms = extractSupplierTerms({
      pool_id: 1,
      industry: "电子，LED显示屏 / Solar",
      products: "LED显示屏;逆变器\n储能",
      certification: "ISO9001, CE,CE",
    });
    expect(terms).toContain("led显示屏");
    expect(terms).toContain("solar");
    expect(terms).toContain("逆变器");
    expect(terms).toContain("储能");
    expect(terms).toContain("iso9001");
    // CE 出现两次 → 去重后仅一个
    expect(terms.filter((t) => t === "ce")).toHaveLength(1);
  });

  it("过滤长度 < 2 的碎片与空值", () => {
    const terms = extractSupplierTerms({ pool_id: 1, industry: "A, LED, ,", products: "", certification: null });
    expect(terms).toEqual(["led"]);
  });
});

describe("buildNoticeCorpus", () => {
  it("拼接全部公告文本字段并小写化", () => {
    const corpus = buildNoticeCorpus({
      title: "LED Display Procurement",
      description: "Supply of LED screens",
      eligibility: "ISO9001 required",
    });
    expect(corpus).toBe("led display procurement\nsupply of led screens\niso9001 required\n\n");
  });

  it("字段缺失时按空串处理不报错", () => {
    expect(buildNoticeCorpus({})).toBe("\n\n\n\n");
  });
});

describe("scoreSupplierAgainstNotice", () => {
  it("每命中一个词项 +2，未命中为 0", () => {
    const corpus = "采购 led 显示屏，要求 iso9001";
    expect(scoreSupplierAgainstNotice(corpus, ["led", "显示屏", "iso9001"])).toBe(6);
    expect(scoreSupplierAgainstNotice(corpus, ["太阳能", "逆变器"])).toBe(0);
  });
});

describe("preFilterSuppliers", () => {
  const notice = { title: "LED 显示屏采购项目", description: "", eligibility: "", technical_hurdles: "", supplier_conditions: "" };

  const makeSupplier = (poolId: number, industry: string): PreFilterSupplier => ({
    pool_id: poolId,
    industry,
    products: "",
    certification: "",
  });

  it("超过上限时按匹配度降序截断，匹配者胜出", () => {
    const suppliers = [
      makeSupplier(1, "纺织"),
      makeSupplier(2, "家具"),
      makeSupplier(3, "LED"),
      makeSupplier(4, "五金"),
      makeSupplier(5, "玩具"),
      makeSupplier(6, "食品"),
      makeSupplier(7, "化工"),
    ];
    const { ranked, candidates } = preFilterSuppliers(notice, suppliers, 5);
    expect(ranked[0].supplier.pool_id).toBe(3);
    expect(ranked[0].matches).toBeGreaterThan(0);
    expect(candidates).toHaveLength(5);
    expect(candidates.map((s) => s.pool_id)).toContain(3);
  });

  it("全部零分时保持资源库原有顺序（稳定排序）", () => {
    const suppliers = [makeSupplier(11, "纺织"), makeSupplier(12, "家具"), makeSupplier(13, "五金")];
    const { candidates } = preFilterSuppliers(notice, suppliers, 2);
    expect(candidates.map((s) => s.pool_id)).toEqual([11, 12]);
  });

  it("不超过上限时返回全部候选", () => {
    const suppliers = [makeSupplier(1, "LED"), makeSupplier(2, "纺织")];
    const { candidates } = preFilterSuppliers(notice, suppliers, 5);
    expect(candidates).toHaveLength(2);
  });
});
