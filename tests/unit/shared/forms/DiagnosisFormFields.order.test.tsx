/**
 * 诊断表单版式回归：投标范围必须在所有能力题之前
 *
 * @module tests/unit/shared/forms/DiagnosisFormFields.order
 * @description 旧版把「目标市场」挂在 D10 之后，看起来像附加题，因果也是反的
 *              （先答 18 题才问投哪儿）。这条测试只看 DOM 顺序，防止以后又被挪回尾部。
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DiagnosisFormFields } from "@/shared/forms/DiagnosisFormFields";

const t = (key: string) => key;

function renderFields() {
  return render(
    <DiagnosisFormFields
      answers={{}}
      t={t}
      onSingle={() => {}}
      onToggleMulti={() => {}}
    />,
  );
}

describe("DiagnosisFormFields 版式", () => {
  it("第 0 步「投标范围」排在 D1 与 D10 之前（不再挂在尾部）", () => {
    const { container } = renderFields();
    const html = container.innerHTML;

    const scopeAt = html.indexOf("diagSectionQualFacts");
    const dim1At = html.indexOf("diagDim1");
    const dim10At = html.indexOf("diagDim10");

    expect(scopeAt).toBeGreaterThanOrEqual(0);
    expect(dim1At).toBeGreaterThan(scopeAt);
    expect(dim10At).toBeGreaterThan(scopeAt);
    // 目标市场是范围区块里唯一的题，必须一起排在前面
    expect(html.indexOf("diagQTargetMarkets")).toBeLessThan(dim1At);
  });

  it("D4 渲染两题管理能力，不再渲染强制文件清单；D1 渲染出口主体资质", () => {
    const { container } = renderFields();
    const html = container.innerHTML;

    expect(html).toContain("diagQCertLedger");
    expect(html).toContain("diagQCertDelivery");
    expect(html).not.toContain("diagQMandatoryDocs");
    expect(html).toContain("diagQExportEntity");
    // V3：6 项资格事实必须在必答区出现
    for (const k of ["diagQLocalPresence", "diagQSimilarProjects", "diagQAnnualRevenue", "diagQAuditReport"]) {
      expect(html).toContain(k);
    }
  });
});
