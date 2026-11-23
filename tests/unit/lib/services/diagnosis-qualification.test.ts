/**
 * 诊断 V3 资质分级单元测试
 *
 * @module tests/unit/lib/services/diagnosis-qualification
 * @description 钉三类容易写错的地方：
 *              1. 「没填目标市场」必须是 null（未分级），不能被算成 C 级；
 *              2. 只有市场准入 / 产品安全类证书进应备清单，管理体系类不该变成某市场的缺口；
 *              3. 多个市场缺同一张证书只算一个缺口（否则市场勾得越多分越低，与事实不符）。
 */
import { describe, it, expect } from "vitest";
import {
  evaluateQualification,
  qualGradeOfMissing,
  normalizeTargetMarkets,
  normalizeCertCode,
  certScopesOf,
  type QualificationCertRef,
} from "@/lib/services/scoring/diagnosis-qualification";

const dict: QualificationCertRef[] = [
  { code: "CE", name: "CE 认证", category: "market_access", scope: "EU" },
  { code: "UKCA", name: "UKCA 认证", category: "market_access", scope: "UK" },
  { code: "FCC", name: "FCC 认证", category: "market_access", scope: "US" },
  { code: "FDA", name: "FDA 注册", category: "product_safety", scope: "US" },
  { code: "SABER", name: "SABER", category: "market_access", scope: "SA" },
  { code: "ISO9001", name: "ISO9001", category: "management", scope: "global" },
  { code: "WRAP", name: "WRAP", category: "esg", scope: "global" },
];

describe("资质分级：档位规则", () => {
  it("缺 0 项 A、缺 1~2 项 B、缺 3 项以上 C（唯一出处）", () => {
    expect(qualGradeOfMissing(0)).toBe("A");
    expect(qualGradeOfMissing(1)).toBe("B");
    expect(qualGradeOfMissing(2)).toBe("B");
    expect(qualGradeOfMissing(3)).toBe("C");
    expect(qualGradeOfMissing(10)).toBe("C");
  });

  it("未选目标市场 = 未分级（null），不是 C 级", () => {
    const r = evaluateQualification({ targetMarkets: [], dict, heldCodes: [] });
    expect(r.grade).toBeNull();
    expect(r.breakdown.unscoredReason).toBe("no_target_markets");
    expect(r.breakdown.missingCount).toBe(0);
  });

  it("目标市场全齐备 → A", () => {
    const r = evaluateQualification({ targetMarkets: ["EU", "US"], dict, heldCodes: ["CE", "FCC", "FDA"] });
    expect(r.grade).toBe("A");
    expect(r.breakdown.missingCodes).toEqual([]);
    expect(r.breakdown.requiredCodes.sort()).toEqual(["CE", "FCC", "FDA"]);
  });

  it("缺 1 项 → B；缺 2 项 → B；缺 3 项 → C", () => {
    expect(evaluateQualification({ targetMarkets: ["EU"], dict, heldCodes: [] }).grade).toBe("B");
    expect(evaluateQualification({ targetMarkets: ["US"], dict, heldCodes: [] }).grade).toBe("B");
    expect(evaluateQualification({ targetMarkets: ["EU", "UK", "US"], dict, heldCodes: [] }).grade).toBe("C");
  });
});

describe("资质分级：应备清单口径", () => {
  it("只有 market_access / product_safety 进应备清单（管理体系/ESG 不算某市场缺口）", () => {
    const r = evaluateQualification({ targetMarkets: ["EU"], dict, heldCodes: [] });
    expect(r.breakdown.requiredCodes).toEqual(["CE"]);
    expect(r.breakdown.requiredCodes).not.toContain("ISO9001");
    expect(r.breakdown.requiredCodes).not.toContain("WRAP");
  });

  it("scope=global 的证书不会白送成每个市场的应备项", () => {
    const onlyGlobal: QualificationCertRef[] = [
      { code: "GLOBALDOC", name: "全球通用", category: "market_access", scope: "global" },
    ];
    const r = evaluateQualification({ targetMarkets: ["EU", "US"], dict: onlyGlobal, heldCodes: [] });
    expect(r.breakdown.requiredCodes).toEqual([]);
    expect(r.breakdown.noRequirementMarkets).toEqual(["EU", "US"]);
    expect(r.grade).toBe("A");
  });

  it("字典里没有该市场准入证书 → 记 noRequirementMarkets，不算缺口", () => {
    const r = evaluateQualification({ targetMarkets: ["JP"], dict, heldCodes: [] });
    expect(r.breakdown.markets).toEqual([{ market: "JP", required: [], missing: [] }]);
    expect(r.breakdown.noRequirementMarkets).toEqual(["JP"]);
    expect(r.grade).toBe("A");
  });

  it("scope 支持逗号多值与大小写（EU,CH 这类组合）", () => {
    expect(certScopesOf("EU, CH")).toEqual(["EU", "CH"]);
    expect(certScopesOf("global")).toEqual([]);
    const multi: QualificationCertRef[] = [
      { code: "CE", name: "CE", category: "market_access", scope: "EU,CH" },
    ];
    expect(evaluateQualification({ targetMarkets: ["EU"], dict: multi, heldCodes: [] }).grade).toBe("B");
  });
});

describe("资质分级：去重与归一", () => {
  it("多个市场缺同一张证书只算一个缺口", () => {
    const shared: QualificationCertRef[] = [
      { code: "CE", name: "CE", category: "market_access", scope: "EU,UK" },
    ];
    const r = evaluateQualification({ targetMarkets: ["EU", "UK"], dict: shared, heldCodes: [] });
    expect(r.breakdown.missingCount).toBe(1);
    expect(r.grade).toBe("B");
  });

  it("已持证书大小写/空白归一后能命中字典 code", () => {
    expect(normalizeCertCode(" ce ")).toBe("CE");
    const r = evaluateQualification({ targetMarkets: ["EU"], dict, heldCodes: ["ce "] });
    expect(r.grade).toBe("A");
  });

  it("目标市场去重并按常量顺序排列（勾选顺序不影响快照）", () => {
    expect(normalizeTargetMarkets(["US", "EU", "US"])).toEqual(["EU", "US"]);
    expect(normalizeTargetMarkets("us,eu")).toEqual(["EU", "US"]);
    expect(normalizeTargetMarkets(["MOON", "EU"])).toEqual(["EU"]);
  });

  it("逐市场明细标出「应备/已持/缺失」，供报告直接渲染", () => {
    const r = evaluateQualification({ targetMarkets: ["US"], dict, heldCodes: ["FCC"] });
    const us = r.breakdown.markets[0];
    expect(us.market).toBe("US");
    expect(us.required).toEqual([
      { code: "FCC", name: "FCC 认证", held: true },
      { code: "FDA", name: "FDA 注册", held: false },
    ]);
    expect(us.missing).toEqual(["FDA"]);
  });

  it("空字典/空已持也不抛错，且明确是未分级原因而非档位", () => {
    const r = evaluateQualification({ targetMarkets: ["EU"], dict: [], heldCodes: [] });
    expect(r.grade).toBe("A");
    expect(r.breakdown.noRequirementMarkets).toEqual(["EU"]);
  });
});
