/**
 * 市场要求判定（迁移 072）：法定门槛决定等级、绿色低碳不计等级
 *
 * @module tests/unit/lib/services/diagnosis-market-requirements
 */
import { describe, it, expect } from "vitest";
import {
  evaluateMarketRequirements,
  gradeWithRequirements,
  mergeRequirementBreakdown,
} from "@/lib/services/scoring/diagnosis-market-requirements";
import type { MarketRequirementRow } from "@/lib/repos/market-requirement.repo";
import { evaluateQualification } from "@/lib/services/scoring/diagnosis-qualification";

const row = (over: Partial<MarketRequirementRow>): MarketRequirementRow => ({
  market: "EU",
  kind: "legal",
  standard: "CE",
  name: "CE 标志",
  certCode: "CE",
  productScopes: ["all"],
  evidence: "DoC + 技术文件",
  remediation: "按指令做型式试验",
  leadTimeDays: 90,
  source: "(EU) 2019/1020",
  version: "2026-11",
  ...over,
});

const base = evaluateQualification({ targetMarkets: ["EU"], dict: [], heldCodes: [], supplierScopes: ["construction"] }).breakdown;

describe("法定门槛决定等级", () => {
  it("缺 0 项 = A；缺 1-2 项 = B；缺 3 项以上 = C", () => {
    const three = [
      row({ standard: "CE", certCode: "CE" }),
      row({ standard: "CBAM", certCode: null, name: "CBAM 申报" }),
      row({ standard: "ROHS", certCode: "ROHS" }),
    ];
    // CBAM 没有证书锚点 → 待核验（不计缺口）；CE/ROHS 已持 → 缺 0\n    expect(evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: three, supplierScopes: [], heldCodes: ["CE", "ROHS"] }).grade).toBe("A");
    expect(evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: three, supplierScopes: [], heldCodes: ["CE"] }).grade).toBe("B");
    // 待核验（CBAM）不计缺口：只缺 CE/ROHS 两项 → B\n    expect(evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: three, supplierScopes: [], heldCodes: [] }).grade).toBe("B");\n    // 三个有证书锚点的都缺 → C\n    const threeAnchored = [row({ standard: "CE" }), row({ standard: "ROHS" }), row({ standard: "FCC" })];\n    expect(evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: threeAnchored, supplierScopes: [], heldCodes: [] }).grade).toBe("C");
  });

  it("没有目标市场 → 未分级（不拿 C 冒充）", () => {
    const r = evaluateMarketRequirements({ targetMarkets: [], requirements: [row({})], supplierScopes: [], heldCodes: [] });
    expect(r.grade).toBeNull();
    expect(r.legal).toEqual([]);
  });
});

describe("产品范围裁剪", () => {
  const reqs = [
    row({ standard: "CE", productScopes: ["eee", "construction"] }),
    row({ standard: "MDR", certCode: "MDR", name: "MDR", productScopes: ["medical"], kind: "legal" }),
    row({ standard: "ISO14067", certCode: null, name: "产品碳足迹", kind: "scoring", productScopes: ["all"] }),
  ];

  it("建筑工程只看到 CE 与通用低碳项，医疗器械要求被排除", () => {
    const r = evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: reqs, supplierScopes: ["construction"], heldCodes: [] });
    expect(r.legal.map((h) => h.standard)).toEqual(["CE"]);
    expect(r.green.map((h) => h.standard)).toEqual(["ISO14067"]);
  });

  it("绿色低碳项不改变等级", () => {
    const r = evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: reqs, supplierScopes: ["construction"], heldCodes: ["CE"] });
    expect(r.grade).toBe("A");
    expect(r.green).toHaveLength(1);
  });
});

describe("合并进诊断快照", () => {
  it("有要求条目时覆盖旧口径的等级与缺口数，并保留旧字段做历史兼容", () => {
    const res = evaluateMarketRequirements({
      targetMarkets: ["EU"],
      requirements: [row({ standard: "CE", certCode: "CE" })],
      supplierScopes: ["construction"],
      heldCodes: [],
    });
    const merged = mergeRequirementBreakdown(base, res);
    expect(merged.requirements?.legalMissingCount).toBe(1);
    expect(merged.missingCount).toBe(1);
    expect(merged.scopeLabels).toEqual(["建筑工程与钢结构"]);
    expect(gradeWithRequirements("C", res)).toBe("B");
  });

  it("没有要求条目时保持旧口径（小市场回退）", () => {
    const res = evaluateMarketRequirements({ targetMarkets: ["EU"], requirements: [], supplierScopes: [], heldCodes: [] });
    expect(mergeRequirementBreakdown(base, res).requirements).toBeUndefined();
    expect(gradeWithRequirements("C", res)).toBe("C");
  });
});
