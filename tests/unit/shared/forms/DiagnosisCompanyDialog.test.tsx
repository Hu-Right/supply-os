/**
 * 诊断入口「检测并确认主体」弹窗 —— 重复绑定提示回归测试
 * @module tests/unit/shared/forms/DiagnosisCompanyDialog.test.tsx
 * @description 钉住需求：当候选公司已被其他用户/账户绑定（bound=true）时，
 *              弹窗必须给出「已被绑定」的明确提示；未绑定的公司不显示该提示。
 *              Radix Modal 在 jsdom 下经 Portal 挂载到 body，用 screen 查询（同 ContactQrModal）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiagnosisCompanyDialog } from "@/shared/forms/DiagnosisCompanyDialog";
import type { DiagnosisCandidate } from "@/shared/api/diagnosis";

// Modal 内部 useLocale 取 uiClose 等键，mock 成回显键名即可
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const t = (k: string) => k;

function candidate(over: Partial<DiagnosisCandidate> = {}): DiagnosisCandidate {
  return {
    supplierId: 1,
    company: "深圳某科技有限公司",
    englishName: "",
    province: "广东",
    city: "深圳",
    establishedAt: "",
    legalRep: "",
    creditCodeMasked: "9144****1234",
    businessType: "",
    verified: false,
    claimPending: false,
    bound: false,
    ...over,
  };
}

function openWith(candidates: DiagnosisCandidate[]) {
  render(
    <DiagnosisCompanyDialog
      open
      candidates={candidates}
      t={t}
      onClose={() => {}}
      onConfirm={() => {}}
      onNotMine={() => {}}
    />,
  );
}

describe("DiagnosisCompanyDialog 重复绑定提示", () => {
  afterEach(cleanup);

  it("bound=true 的公司显示「已被绑定」徽章", () => {
    openWith([candidate({ bound: true })]);
    expect(screen.getByText("diagBadgeBound")).toBeInTheDocument();
  });

  it("未绑定的公司不显示「已被绑定」，但保留「已认证」徽章", () => {
    openWith([candidate({ verified: true, bound: false })]);
    expect(screen.queryByText("diagBadgeBound")).toBeNull();
    expect(screen.getByText("diagBadgeVerified")).toBeInTheDocument();
  });

  it("已认证且被他人绑定：两枚徽章同时呈现", () => {
    openWith([candidate({ verified: true, bound: true })]);
    expect(screen.getByText("diagBadgeBound")).toBeInTheDocument();
    expect(screen.getByText("diagBadgeVerified")).toBeInTheDocument();
  });
});
