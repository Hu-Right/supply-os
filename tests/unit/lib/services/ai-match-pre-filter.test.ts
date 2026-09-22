/**
 * AI 匹配候选粗筛（规则引擎）测试
 * @module tests/unit/lib/services/ai-match-pre-filter.test.ts
 * @description 纯函数验证：词项提取、公告语料拼接、重叠打分、粗筛排序与截断；
 *              UNSPSC 层级分档：命中越深层越优先（L1 不计），不命中/无码回落词项。
 */
import { describe, it, expect } from "vitest";
import {
  extractSupplierTerms,
  buildNoticeCorpus,
  scoreSupplierAgainstNotice,
  preFilterSuppliers,
  unspscTier,
  type PreFilterSupplier,
  type PreFilterUnspscData,
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

describe("unspscTier（最深命中层级定档）", () => {
  const noticeLevels = new Map<number, Set<string>>([
    [1, new Set(["seg1"])],
    [2, new Set(["fam2"])],
    [3, new Set(["cls3"])],
    [4, new Set(["cmd4"])],
    [5, new Set(["cmt5"])],
  ]);

  it("多级都命中时取最深命中层级", () => {
    const supplier = new Map<number, Set<string>>([
      [2, new Set(["fam2"])],
      [5, new Set(["cmt5"])],
    ]);
    expect(unspscTier(supplier, noticeLevels)).toBe(5);
  });

  it("仅 L1 命中不计档（过宽）", () => {
    const supplier = new Map<number, Set<string>>([[1, new Set(["seg1"])]]);
    expect(unspscTier(supplier, noticeLevels)).toBe(0);
  });

  it("无交集/任一侧为空 → 0", () => {
    expect(unspscTier(new Map([[3, new Set(["other"])]]), noticeLevels)).toBe(0);
    expect(unspscTier(new Map(), noticeLevels)).toBe(0);
    expect(unspscTier(new Map([[3, new Set(["cls3"])]]), new Map())).toBe(0);
  });
});

describe("preFilterSuppliers UNSPSC 层级分档 + 词项兜底", () => {
  const notice = { title: "纺织面料采购项目", description: "", eligibility: "", technical_hurdles: "", supplier_conditions: "" };
  /** 供应商行：industry 同时决定词项分（"纺织" 命中公告标题，"LED" 不命中） */
  const sup = (poolId: number, supplierId: number, industry: string): PreFilterSupplier => ({
    pool_id: poolId, supplier_id: supplierId, industry, products: "", certification: "",
  });
  /** level→id 数组 → Set Map（避免深层嵌套括号易错） */
  const lv = (entries: Array<[number, string[]]>): Map<number, Set<string>> =>
    new Map(entries.map(([level, ids]) => [level, new Set(ids)]));
  /** supplierLevels 单项：[supplierId, 层级→id 集] */
  const sLv = (supplierId: number, entries: Array<[number, string[]]>): [number, Map<number, Set<string>>] =>
    [supplierId, lv(entries)];

  it("编码 L5 命中的无词项供应商，压过无码但词项命中的供应商", () => {
    const unspsc: PreFilterUnspscData = {
      noticeLevels: lv([[5, ["n5"]]]),
      supplierLevels: new Map([sLv(1, [[5, ["n5"]]])]),
    };
    const suppliers = [sup(1, 1, "LED"), sup(2, 2, "纺织")];
    const { ranked, candidates } = preFilterSuppliers(notice, suppliers, 1, unspsc);
    expect(ranked[0].supplier.pool_id).toBe(1);
    expect(ranked[0].matches).toBeGreaterThanOrEqual(1000);
    expect(candidates.map((s) => s.pool_id)).toEqual([1]);
  });

  it("命中层级更深者优先（L5 压 L2，插入顺序靠后也反超）", () => {
    const unspsc: PreFilterUnspscData = {
      noticeLevels: lv([[2, ["n2"]], [5, ["n5"]]]),
      supplierLevels: new Map([sLv(11, [[2, ["n2"]]]), sLv(12, [[5, ["n5"]]])]),
    };
    const { ranked } = preFilterSuppliers(notice, [sup(11, 11, "五金"), sup(12, 12, "化工")], 5, unspsc);
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([12, 11]);
  });

  it("仅 L1 命中不产生档位：回落词项竞争", () => {
    const unspsc: PreFilterUnspscData = {
      noticeLevels: lv([[1, ["n1"]]]),
      supplierLevels: new Map([sLv(1, [[1, ["n1"]]])]),
    };
    const { ranked } = preFilterSuppliers(notice, [sup(1, 1, "LED"), sup(2, 2, "纺织")], 5, unspsc);
    expect(ranked[0].supplier.pool_id).toBe(2); // 词项命中者胜，L1 不算档
    expect(ranked[0].matches).toBeLessThan(1000);
  });

  it("有码但与公告完全不命中 → 与无码同档，按词项分竞争", () => {
    const unspsc: PreFilterUnspscData = {
      noticeLevels: lv([[5, ["other5"]]]),
      supplierLevels: new Map([sLv(1, [[5, ["own5"]]])]),
    };
    const suppliers = [sup(1, 1, "LED"), sup(2, 2, "纺织")];
    const { ranked } = preFilterSuppliers(notice, suppliers, 5, unspsc);
    // 工厂2 词项命中（+2）应排在有码不命中且零词项的工厂1 之前
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([2, 1]);
  });

  it("不传 unspsc 入参时行为与旧版一致（向后兼容）", () => {
    const suppliers = [sup(1, 1, "LED"), sup(2, 2, "纺织")];
    const { ranked } = preFilterSuppliers(notice, suppliers, 5);
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([2, 1]);
  });
});
