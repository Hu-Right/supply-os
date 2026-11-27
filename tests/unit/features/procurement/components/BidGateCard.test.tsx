/**
 * BidGateCard 单元测试
 *
 * @module tests/unit/features/procurement/components/BidGateCard
 * @description 资格判定卡把两件事分开呈现，且不许互相淹没：
 *              1. 资格（A 段合格制）—— 废标项在，总分再高也判不可投；
 *              2. 竞争力（B 段评分）—— 与资格并列显示，不参与资格结论；
 *              3. 可补项与国别准入缺口分别成块，附整改动作与周期；
 *              4. i18n 缺键时标题回落到常量里的中文兜底。
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BidGateCard } from "@/features/procurement/components/BidGateCard";
import { evaluateBidGate } from "@/shared/constants/diagnosis-bid-gate";
import {
  DIAGNOSIS_V5_FIELD_MAP,
  DIAGNOSIS_V5_FORM_FIELDS,
} from "@/shared/constants/diagnosis-v5";
import type { DiagnosisQualBreakdown } from "@/shared/api/diagnosis";

/** 只翻译卡片骨架，规则标题故意留空以验证中文兜底 */
const DICT: Record<string, string> = {
  bidGateEligibilityTitle: "投标资格",
  bidGateCompetitivenessTitle: "竞争力",
  bidGateCompetitivenessHint: "只影响中标概率",
  bidGateHardBlocksTitle: "废标项清单",
  bidGateHardBlocksHint: "国际资格预审是合格制",
  bidGateSoftBlocksTitle: "可补项清单",
  bidGateSoftBlocksHint: "补齐后可投",
  bidGateLegalGapTitle: "目标市场准入缺口",
  bidGateLegalGapHint: "尚未取得的强制认证",
  bidGateNextActionsTitle: "优先整改",
  bidGateNextActionsHint: "废标优先",
  bidGateHardBlock: "废标项",
  bidGateSoftBlock: "可补项",
  bidGateFixLabel: "整改",
  bidGateLeadDays: "约 {n} 天",
  bidGateLeadUnknown: "周期视外部条件",
  bidGateMarketsUnit: "个市场",
  bidGateLegalGapMore: "另有 {n} 项",
  bidGateDerivedMissing: "未取到准入数据",
};
const t = (key: string) => DICT[key] ?? "";

function bestAnswers(): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {};
  for (const field of DIAGNOSIS_V5_FORM_FIELDS) {
    if (field.kind === "multi") answers[field.key] = [...(field.options ?? [])];
    else answers[field.key] = field.options?.[field.options.length - 1] ?? "";
  }
  return answers;
}

function withOption(answers: Record<string, string | string[]>, key: string, index: number) {
  return { ...answers, [key]: DIAGNOSIS_V5_FIELD_MAP[key].options?.[index] ?? "" };
}

const CLEAN = { legalMissingCount: 0, certCoveragePercent: 100 };

describe("BidGateCard", () => {
  it("全项达标 → 显示「可进入投标名单」，无废标项区块", () => {
    const gate = evaluateBidGate(bestAnswers(), 45, CLEAN);
    render(<BidGateCard gate={gate} t={t} />);
    expect(screen.getByText("可进入投标名单")).toBeTruthy();
    expect(screen.queryByText("废标项清单")).toBeNull();
    expect(screen.getByText("竞争力达标")).toBeTruthy();
  });

  it("有废标项 → 判「不可投」，且并列显示竞争力（互不换算）", () => {
    const gate = evaluateBidGate(withOption(bestAnswers(), "export_entity", 0), 50, CLEAN);
    render(<BidGateCard gate={gate} t={t} />);
    expect(screen.getByText("不可投（废标项未过）")).toBeTruthy();
    // 总分满分也不能把资格拉回来
    expect(screen.getByText("竞争力达标")).toBeTruthy();
    expect(screen.getByText("废标项清单")).toBeTruthy();
    // 标题走中文兜底（i18n 缺键）
    expect(screen.getAllByText("无出口主体资质").length).toBeGreaterThan(0);
  });

  it("只有可补项 → 判「有条件可投」，废标区块不出现", () => {
    const gate = evaluateBidGate(withOption(bestAnswers(), "local_presence", 0), 30, CLEAN);
    render(<BidGateCard gate={gate} t={t} />);
    expect(screen.getByText("有条件可投")).toBeTruthy();
    expect(screen.queryByText("废标项清单")).toBeNull();
    expect(screen.getByText("可补项清单")).toBeTruthy();
    expect(screen.getAllByText("目标市场无代理 / 实体").length).toBeGreaterThan(0);
  });

  it("准入缺口 ≥3 → 出局；缺口逐条渲染市场名与整改", () => {
    const gate = evaluateBidGate(bestAnswers(), 45, { legalMissingCount: 4 });
    const qual = {
      targetMarkets: ["SA", "ID"],
      markets: [],
      requiredCodes: [],
      heldCodes: [],
      missingCodes: [],
      missingCount: 2,
      noRequirementMarkets: [],
      unscoredReason: null,
      requirements: {
        legal: [
          { market: "沙特", kind: "legal", standard: "SASO", name: "SASO 产品符合性证书", held: false, evidence: "", remediation: "委托认可机构做 PC 认证", leadTimeDays: 90, source: "market_requirement" },
          { market: "印尼", kind: "legal", standard: "SNI", name: "SNI 认证", held: false, evidence: "", remediation: "通过 LSPro 注册", leadTimeDays: 120, source: "market_requirement" },
          { market: "欧盟", kind: "legal", standard: "CE", name: "CE 自我声明", held: true, evidence: "", remediation: "", leadTimeDays: null, source: "market_requirement" },
        ],
        green: [],
        legalMissingCount: 2,
      },
    } as unknown as DiagnosisQualBreakdown;

    render(<BidGateCard gate={gate} qualBreakdown={qual} t={t} />);
    expect(screen.getByText("不可投（废标项未过）")).toBeTruthy();
    expect(screen.getByText("目标市场准入缺口")).toBeTruthy();
    expect(screen.getByText("SASO 产品符合性证书")).toBeTruthy();
    expect(screen.getByText("SNI 认证")).toBeTruthy();
    expect(screen.getByText("委托认可机构做 PC 认证")).toBeTruthy();
    // 已持的 CE 不进缺口清单
    expect(screen.queryByText("CE 自我声明")).toBeNull();
  });

  it("准入数据缺失时给出「只覆盖表单可判项」的说明", () => {
    const gate = evaluateBidGate(bestAnswers(), 45, {});
    render(<BidGateCard gate={gate} t={t} />);
    expect(screen.getByText("未取到准入数据")).toBeTruthy();
  });

  it("优先整改按「废标优先、周期短优先」编号", () => {
    const answers = { ...withOption(bestAnswers(), "export_entity", 0), target_channels: [] };
    const gate = evaluateBidGate(answers, 20, CLEAN);
    render(<BidGateCard gate={gate} t={t} />);
    expect(screen.getByText("优先整改")).toBeTruthy();
    // 编号 1 必须落在废标项上
    expect(gate.nextActions[0].level).toBe("disqualify");
  });
});
