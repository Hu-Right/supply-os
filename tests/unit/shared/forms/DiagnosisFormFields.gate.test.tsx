/**
 * 诊断表单 —— 资格项标注与实时闸门提示
 *
 * @module tests/unit/shared/forms/DiagnosisFormFields.gate
 * @description 表单要让人一眼看出「哪几题决定能不能投标」：
 *              1. 废标项题打「资格项」标、可补项题打「可补项」标，纯评分题不打标；
 *              2. A 段顶部显示资格项作答进度，没答完要明说判不出结论；
 *              3. B / C 段各有一句「本部分不影响资格」的定位说明。
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DiagnosisFormFields } from "@/shared/forms/DiagnosisFormFields";
import {
  BID_GATE_RULES,
} from "@/shared/constants/diagnosis-bid-gate";
import { DIAGNOSIS_V5_FIELD_MAP } from "@/shared/constants/diagnosis-v5";

const DICT: Record<string, string> = {
  bidGateBadgeHard: "资格项",
  bidGateBadgeSoft: "可补项",
  bidGateLiveProgress: "资格项已答 {answered}/{total}",
  bidGateLiveIncomplete: "资格项没答完，暂时判不出能不能投标。",
  bidGateLiveClean: "暂未发现废标项",
  bidGateLiveTitle: "已填部分：{hard} 项废标项、{soft} 项可补项",
  bidGateLiveNoHard: "暂无废标项",
  diagV5PartAHint: "A段说明",
  diagV5PartBHint: "B段说明：不影响能否入围",
  diagV5PartCHint: "C段说明：不影响资格判定",
  // 闸门规则标题走 i18n；缺键时才回落到常量里的 titleZh
  bidGateRExportEntity: "无出口主体资质",
};
const t = (key: string) => DICT[key] ?? key;

function renderFields(answers: Record<string, string | string[]> = {}) {
  return render(
    <DiagnosisFormFields
      answers={answers}
      t={t}
      onSingle={() => {}}
      onToggleMulti={() => {}}
    />,
  );
}

/** 某道题的字段块 HTML */
function blockHtml(container: HTMLElement, fieldKey: string): string {
  return container.querySelector(`#diag-field-${fieldKey}`)?.innerHTML ?? "";
}

/** 表单可判的废标项题目（与组件内推导同源：闸门规则里 disqualify 且是表单字段） */
const HARD_FIELDS = [
  ...new Set(
    BID_GATE_RULES
      .filter((r) => r.level === "disqualify" && DIAGNOSIS_V5_FIELD_MAP[r.fieldKey]?.source === "form")
      .map((r) => r.fieldKey),
  ),
];

describe("DiagnosisFormFields · 资格项标注", () => {
  it("废标项题目打「资格项」标", () => {
    const { container } = renderFields();
    expect(HARD_FIELDS.length).toBeGreaterThanOrEqual(4);
    for (const key of HARD_FIELDS) {
      expect(blockHtml(container, key)).toContain("资格项");
    }
  });

  it("可补项题目打「可补项」标（含业绩两问）", () => {
    const { container } = renderFields();
    for (const key of ["local_presence", "record_evidence", "overseas_record"]) {
      const html = blockHtml(container, key);
      expect(html).toContain("可补项");
      expect(html).not.toContain("资格项");
    }
  });

  it("纯评分题不打标（成本报价只影响中标概率）", () => {
    const { container } = renderFields();
    const html = blockHtml(container, "cost_pricing");
    expect(html).not.toContain("资格项");
    expect(html).not.toContain("可补项");
  });
});

describe("DiagnosisFormFields · 实时闸门提示", () => {
  it("未答资格项时显示进度 0/N，并说明判不出结论", () => {
    const { container } = renderFields({});
    const html = container.innerHTML;
    expect(html).toContain(`资格项已答 0/${HARD_FIELDS.length}`);
    expect(html).toContain("资格项没答完");
  });

  it("资格项全部答完后进度满格，不再提示未答完", () => {
    const answers: Record<string, string | string[]> = {};
    for (const key of HARD_FIELDS) {
      answers[key] = DIAGNOSIS_V5_FIELD_MAP[key].options?.at(-1) ?? "";
    }
    const { container } = renderFields(answers);
    const html = container.innerHTML;
    expect(html).toContain(`资格项已答 ${HARD_FIELDS.length}/${HARD_FIELDS.length}`);
    expect(html).not.toContain("资格项没答完");
  });

  it("答出废标项时当场列出来", () => {
    const answers: Record<string, string | string[]> = {
      export_entity: DIAGNOSIS_V5_FIELD_MAP["export_entity"].options?.[0] ?? "",
    };
    const { container } = renderFields(answers);
    expect(container.innerHTML).toContain("无出口主体资质");
  });
});

describe("DiagnosisFormFields · 段落定位说明", () => {
  it("B / C 段各有一句「不影响资格」的说明", () => {
    const { container } = renderFields();
    const html = container.innerHTML;
    expect(html).toContain("B段说明：不影响能否入围");
    expect(html).toContain("C段说明：不影响资格判定");
  });
});
