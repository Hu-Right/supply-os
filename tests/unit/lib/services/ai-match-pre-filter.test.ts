/**
 * AI 匹配候选粗筛（规则引擎）测试
 * @module tests/unit/lib/services/ai-match-pre-filter.test.ts
 * @description 纯函数验证：词项提取、公告语料拼接、重叠打分、粗筛排序与截断；
 *              骨架节点码定档：命中越深层越优先（L1 不计），不命中/无码回落词项。
 *              2026-10-11 换口径：两侧键从旧字典 `旧品类字典表` 的行 id 换成
 *              骨架节点码（`UGT-*`），层级不再靠「同一 level 键相等」而是交集最深层。
 */
import { describe, it, expect } from "vitest";
import {
  extractSupplierTerms,
  buildNoticeCorpus,
  scoreSupplierAgainstNotice,
  preFilterSuppliers,
  nodeTier,
  type PreFilterSupplier,
  type PreFilterMatchData,
} from "@/lib/services/ai-match/pre-filter";
import { sharedDepth } from "@/lib/services/notices/similar-scoring";

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

describe("nodeTier（交集最深层定档）", () => {
  it("深浅都命中时取最深", () => {
    const notice = new Set(["UGT-01", "UGT-0102", "UGT-010203", "UGT-01020304", "UGT-0102030405"]);
    const supplier = new Set(["UGT-01", "UGT-0102", "UGT-0102030405"]);
    expect(nodeTier(supplier, notice)).toBe(5);
  });

  it("仅 L1 命中不计档（大类过宽会引入跨行业误报，与旧口径一致）", () => {
    expect(nodeTier(new Set(["UGT-01"]), new Set(["UGT-01", "UGT-0102"]))).toBe(0);
  });

  it("同父不同子 → 定在共同的父层", () => {
    const notice = new Set(["UGT-01", "UGT-0102", "UGT-010204"]);
    const supplier = new Set(["UGT-01", "UGT-0102", "UGT-010203"]);
    expect(nodeTier(supplier, notice)).toBe(2);
  });

  it("无交集/任一侧为空 → 0", () => {
    expect(nodeTier(new Set(["UGT-05", "UGT-0501"]), new Set(["UGT-01"]))).toBe(0);
    expect(nodeTier(new Set(), new Set(["UGT-01"]))).toBe(0);
    expect(nodeTier(undefined, new Set(["UGT-01"]))).toBe(0);
    expect(nodeTier(new Set(["UGT-0102"]), new Set())).toBe(0);
  });

  it("脏 token 不参与定档（形制判定只认 backboneNodeLevel）", () => {
    // 两个同样的脏码在旧写法里是「同一层的同一个 id」⇒ 直接得满分，今天能长出一条不存在的强匹配
    expect(nodeTier(new Set(["UGT-XY", "42101503"]), new Set(["UGT-XY", "42101503"]))).toBe(0);
    // 旧码制（2026-10-13 改码前的 `UGT-*`）同样不认：形制不匹配就是 0 档，
    // 否则一次改码会让存量旧码悄悄拿到“满分强匹配”。
    expect(nodeTier(new Set(["UGT-B-0102"]), new Set(["UGT-B-0102"]))).toBe(0);
  });

  it("与 sharedDepth 逐对取最深等价（两侧祖先全存才成立）", () => {
    const notice = ["UGT-07", "UGT-0702", "UGT-070203", "UGT-07020301"];
    const peers = [
      ["UGT-07", "UGT-0702", "UGT-070203", "UGT-07020301", "UGT-0702030102"],
      ["UGT-07", "UGT-0702", "UGT-070205"],
      ["UGT-07", "UGT-0709", "UGT-070901"],
      ["UGT-08", "UGT-0801"],
    ];
    for (const peer of peers) {
      const byPair = Math.max(
        0,
        ...peer.flatMap((p) => notice.map((n) => (sharedDepth(p, n) >= 2 ? sharedDepth(p, n) : 0))),
      );
      expect(nodeTier(new Set(peer), new Set(notice))).toBe(byPair);
    }
  });
});

describe("preFilterSuppliers 节点码分档 + 词项兜底", () => {
  const notice = { title: "纺织面料采购项目", description: "", eligibility: "", technical_hurdles: "", supplier_conditions: "" };
  /** 供应商行：industry 同时决定词项分（"纺织" 命中公告标题，"LED" 不命中） */
  const sup = (poolId: number, supplierId: number, industry: string): PreFilterSupplier => ({
    pool_id: poolId, supplier_id: supplierId, industry, products: "", certification: "",
  });

  it("节点码 L5 命中的无词项供应商，压过无码但词项命中的供应商", () => {
    const data: PreFilterMatchData = {
      noticeNodes: new Set(["UGT-42", "UGT-4210", "UGT-421015", "UGT-42101503", "UGT-4210150301"]),
      supplierNodes: new Map([[1, new Set(["UGT-42", "UGT-4210", "UGT-421015", "UGT-42101503", "UGT-4210150301"])]])
    };
    const suppliers = [sup(1, 1, "LED"), sup(2, 2, "纺织")];
    const { ranked, candidates } = preFilterSuppliers(notice, suppliers, 1, data);
    expect(ranked[0].supplier.pool_id).toBe(1);
    expect(ranked[0].matches).toBeGreaterThanOrEqual(1000);
    expect(candidates.map((s) => s.pool_id)).toEqual([1]);
  });

  it("命中层级更深者优先（L5 压 L2，插入顺序靠后也反超）", () => {
    const data: PreFilterMatchData = {
      noticeNodes: new Set(["UGT-42", "UGT-4210", "UGT-4214", "UGT-421401", "UGT-42140105", "UGT-4214010509"]),
      supplierNodes: new Map([
        [11, new Set(["UGT-42", "UGT-4214"])],
        [12, new Set(["UGT-42", "UGT-4214", "UGT-421401", "UGT-42140105", "UGT-4214010509"])],
      ]),
    };
    const { ranked } = preFilterSuppliers(notice, [sup(11, 11, "五金"), sup(12, 12, "化工")], 5, data);
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([12, 11]);
  });

  it("仅 L1 命中不产生档位：回落词项竞争", () => {
    const data: PreFilterMatchData = {
      noticeNodes: new Set(["UGT-42"]),
      supplierNodes: new Map([[1, new Set(["UGT-42"])]])
    };
    const { ranked } = preFilterSuppliers(notice, [sup(1, 1, "LED"), sup(2, 2, "纺织")], 5, data);
    expect(ranked[0].supplier.pool_id).toBe(2); // 词项命中者胜，L1 不算档
    expect(ranked[0].matches).toBeLessThan(1000);
  });

  it("有码但与公告完全不命中 → 与无码同档，按词项分竞争", () => {
    const data: PreFilterMatchData = {
      noticeNodes: new Set(["UGT-42", "UGT-4214", "UGT-4214010509"]),
      supplierNodes: new Map([[1, new Set(["UGT-71", "UGT-7110", "UGT-7110150301"])]])
    };
    const suppliers = [sup(1, 1, "LED"), sup(2, 2, "纺织")];
    const { ranked } = preFilterSuppliers(notice, suppliers, 5, data);
    // 工厂2 词项命中（+2）应排在有码不命中且零词项的工厂1 之前
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([2, 1]);
  });

  it("供应商不在码集里（新绑/手动新建）→ 只按词项竞争", () => {
    const data: PreFilterMatchData = {
      noticeNodes: new Set(["UGT-42", "UGT-4214", "UGT-421401"]),
      supplierNodes: new Map([[1, new Set(["UGT-42", "UGT-4214", "UGT-421401"])]])
    };
    const { ranked } = preFilterSuppliers(notice, [sup(9, 9, "纺织"), sup(1, 1, "LED")], 5, data);
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([1, 9]);
  });

  it("不传节点码数据时行为与旧版一致（向后兼容）", () => {
    const suppliers = [sup(1, 1, "LED"), sup(2, 2, "纺织")];
    const { ranked } = preFilterSuppliers(notice, suppliers, 5);
    expect(ranked.map((r) => r.supplier.pool_id)).toEqual([2, 1]);
  });
});
