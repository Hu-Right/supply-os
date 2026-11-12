/**
 * 诊断入口「检测并确认主体」弹窗 —— 重复绑定提示与禁选回归测试
 * @module tests/unit/shared/forms/DiagnosisCompanyDialog.test.tsx
 * @description 钉住两件事：
 *              ① 当候选公司已被其他用户/账户绑定（bound=true）时，
 *                弹窗必须给出「已被绑定」的明确提示；未绑定的公司不显示该提示。
 *              ② 2026-11-11 一司一份口径：有主主体（bound / claimPending / 已认证且非我的）
 *                「选不中」——确认按钮禁用并出现锁定提示条；自己的主体（mine）即使已认证也放行。
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
    province: "广东",
    city: "深圳",
    establishedAt: "",
    legalRep: "",
    creditCodeMasked: "9144****1234",
    businessType: "",
    verified: false,
    claimPending: false,
    bound: false,
    mine: false,
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

describe("DiagnosisCompanyDialog 一司一份禁选（2026-11-11）", () => {
  afterEach(cleanup);

  const confirmBtn = () => screen.getByRole("button", { name: "diagDialogConfirm" });

  it("有主主体（他人绑定）：按钮禁用并出现锁定提示", () => {
    openWith([candidate({ bound: true })]);
    expect(confirmBtn()).toBeDisabled();
    expect(screen.getByText("diagDialogLocked")).toBeInTheDocument();
  });

  it("已认证且非我的主体：禁选", () => {
    openWith([candidate({ verified: true, mine: false })]);
    expect(confirmBtn()).toBeDisabled();
    expect(screen.getByText("diagDialogLocked")).toBeInTheDocument();
  });

  it("认领排他期（claimPending）：禁选", () => {
    openWith([candidate({ claimPending: true })]);
    expect(confirmBtn()).toBeDisabled();
  });

  it("自己的主体（mine）即使已认证：按钮可用，不出现锁定提示", () => {
    openWith([candidate({ verified: true, mine: true })]);
    expect(confirmBtn()).toBeEnabled();
    expect(screen.queryByText("diagDialogLocked")).toBeNull();
    expect(screen.getByText("diagBadgeMine")).toBeInTheDocument();
  });

  it("无主主体：按钮可用，无锁定提示", () => {
    openWith([candidate({})]);
    expect(confirmBtn()).toBeEnabled();
    expect(screen.queryByText("diagDialogLocked")).toBeNull();
  });
});
