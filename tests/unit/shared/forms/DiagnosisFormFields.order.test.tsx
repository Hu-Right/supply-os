/**
 * 诊断 V5 表单版式回归：目标市场必须在资质部分，证书不得在表单收集
 *
 * @module tests/unit/shared/forms/DiagnosisFormFields.order
 * @description 目标市场是证书比对的入口，必须排在能力题之前；证书/资质从供应商表读取，
 *              表单只出现目标市场，不出现任何证书题。
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

describe("DiagnosisFormFields V5 版式", () => {
  it("目标市场在 A 部分，排在 B/C 之前", () => {
    const { container } = renderFields();
    const html = container.innerHTML;

    const targetAt = html.indexOf("diagV5TargetMarkets");
    const partBAt = html.indexOf("diagV5PartB");
    const partCAt = html.indexOf("diagV5PartC");

    expect(targetAt).toBeGreaterThanOrEqual(0);
    expect(partBAt).toBeGreaterThan(targetAt);
    expect(partCAt).toBeGreaterThan(partBAt);
  });

  it("证书不在表单收集：不渲染证书覆盖率、台账、取证时效", () => {
    const { container } = renderFields();
    const html = container.innerHTML;

    expect(html).not.toContain("diagV5CertCoverage");
    expect(html).not.toContain("diagQCertLedger");
    expect(html).not.toContain("diagQCertDelivery");
    expect(html).not.toContain("diagQExportEntity");
  });

  it("A/B/C 三部分与 12 个维度都渲染", () => {
    const { container } = renderFields();
    const html = container.innerHTML;

    for (const part of ["A", "B", "C"]) expect(html).toContain(`diagV5Part${part}`);
    for (let i = 1; i <= 12; i += 1) expect(html).toContain(`diagV5Dim${i}`);
  });

  it("V5 能力题出现在表单里", () => {
    const { container } = renderFields();
    const html = container.innerHTML;

    for (const key of [
      "diagV5ExportEntity",
      "diagV5FinanceCredit",
      "diagV5TechnicalResponse",
      "diagV5QualitySystem",
      "diagV5ServiceSla",
      // 2026-11-27：业绩由「投标履历」六档改为「有无业绩 + 能否举证」两问
      "diagV5OverseasRecord",
      "diagV5RecordEvidence",
    ]) {
      expect(html).toContain(key);
    }
  });
});
