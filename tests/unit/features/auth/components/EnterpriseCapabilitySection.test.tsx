/**
 * 企业能力档案区块 — 错误态分流回归（用户实报：点“添加能力项”没填名称，
 * 整块被替换成“请填写能力名称 + 重试”空态，表单消失无法继续输入）。
 *
 * 口径：加载失败走 DataState 错误态（错误+重试，替换内容）；
 *       表单/动作校验错误走 actionError 内联提示（内容保持可见）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { state } = vi.hoisted(() => ({ state: { data: {} as Record<string, unknown> } }));

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));
vi.mock("@/features/auth/components/enterprise-capability/useEnterpriseCapabilityData", () => ({
  useEnterpriseCapabilityData: () => state.data,
}));
vi.mock("@/features/auth/components/enterprise-capability/CapabilityFormFields", () => ({
  CapabilityFormFields: () => null,
}));


import { EnterpriseCapabilitySection } from "@/features/auth/components/EnterpriseCapabilitySection";

const base = () => ({
  profile: { capabilities: [] },
  loading: false,
  error: null as string | null,
  actionError: null as string | null,
  load: vi.fn(),
  capType: "certification",
  setCapType: vi.fn(),
  capName: "",
  setCapName: vi.fn(),
  fields: { noExpiry: true },
  setField: vi.fn(),
  resetFields: vi.fn(),
  savingCap: false,
  submitCapability: vi.fn(),
  deleteCapability: vi.fn(),
});

describe("EnterpriseCapabilitySection 错误态分流", () => {
  beforeEach(() => { state.data = base(); });

  it("动作校验错误 → 内联 alert，表单仍可见，不出现整块重试", () => {
    state.data = { ...base(), actionError: "证书需填写有效期，或选择长期有效" };
    render(<EnterpriseCapabilitySection enabled />);

    expect(screen.getByRole("alert")).toHaveTextContent("证书需填写有效期，或选择长期有效");
    expect(screen.getByText("capAddItem")).toBeInTheDocument();
    expect(screen.queryByText("capRetry")).toBeNull();
  });

  it("整档加载失败 → DataState 错误态（重试按钮），表单不渲染", () => {
    state.data = { ...base(), error: "加载失败" };
    render(<EnterpriseCapabilitySection enabled />);

    expect(screen.getByText("加载失败")).toBeInTheDocument();
    expect(screen.getByText("capRetry")).toBeInTheDocument();
    expect(screen.queryByText("capAddItem")).toBeNull();
  });

  it("未使能（未绑定企业）→ 整块不渲染", () => {
    render(<EnterpriseCapabilitySection enabled={false} />);
    expect(screen.queryByTestId("enterprise-capability-section")).toBeNull();
  });

  it("证据资料已下线：区块内不再出现证据面板（2026-11-19 与能力档案合并）", () => {
    render(<EnterpriseCapabilitySection enabled />);
    expect(screen.getByTestId("enterprise-capability-section")).toBeInTheDocument();
    expect(screen.queryByText("capEvidenceSectionTitle")).toBeNull();
    expect(screen.queryByText("capSaveEvidence")).toBeNull();
  });
});
