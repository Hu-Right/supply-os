/**
 * SupplierClaimModal 单元测试
 *
 * @module tests/unit/features/supplier-profile/components/SupplierClaimModal
 * @description 认领弹窗已瘦身为「规则确认」（2026-09-29 简化：不再收联系人/手机号，
 *              执照改到企业信息页限时上传）：
 *              1. 只发 supplier_id，请求体不再带任何联系方式字段；
 *              2. 成功即回调 onSuccess 并跳转企业信息页补执照；
 *              3. 失败展示后端文案并恢复可点，不跳转；
 *              4. 提交期间禁用关闭并屏蔽遮罩点击，避免半提交状态被关掉；
 *              5. 文案全部走 i18n 键（组件内保留中文兜底）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { apiMock, pushMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/core/http", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
// t() 返回键名：断言直接盯键，键漏配或多语言错位会被 check-i18n 另行拦截
vi.mock("@/core/i18n", () => ({ useLocale: () => ({ locale: "zh", t: (k: string) => k }) }));

import { SupplierClaimModal } from "@/features/supplier-profile/components/SupplierClaimModal";

const props = {
  supplierId: 123,
  companyName: "杭州某某机械有限公司",
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  apiMock.mockReset();
  pushMock.mockReset();
  props.onClose.mockReset();
  props.onSuccess.mockReset();
});

describe("SupplierClaimModal", () => {
  it("渲染规则确认文案（i18n 键）与公司名，不再有联系方式输入框", () => {
    render(<SupplierClaimModal {...props} />);
    expect(screen.getByText("profile_claimTitle")).toBeInTheDocument();
    expect(screen.getByText("profile_claimBoundNote")).toBeInTheDocument();
    expect(screen.getByText("profile_claimDeadlineNote")).toBeInTheDocument();
    expect(screen.getByText("profile_claimConfirmCta")).toBeInTheDocument();
    expect(screen.getByText("杭州某某机械有限公司")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("确认认领：只发 supplier_id，成功后回调并跳转企业信息页", async () => {
    apiMock.mockResolvedValue({ id: 1, status: "pending" });
    render(<SupplierClaimModal {...props} />);
    fireEvent.click(screen.getByText("profile_claimConfirmCta"));

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    const [url, init] = apiMock.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe("/api/supplier-claims");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({ supplier_id: 123 });
    expect(props.onSuccess).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/settings/enterprise");
  });

  it("失败：展示后端错误文案，不跳转且按钮恢复可用", async () => {
    apiMock.mockRejectedValue(new Error("该公司已有认领申请正在处理中"));
    render(<SupplierClaimModal {...props} />);
    fireEvent.click(screen.getByText("profile_claimConfirmCta"));

    expect(await screen.findByText("该公司已有认领申请正在处理中")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("profile_claimConfirmCta")).toBeEnabled();
  });

  it("失败且异常不是 Error 实例 → 回落到提交失败文案键", async () => {
    apiMock.mockRejectedValue("boom");
    render(<SupplierClaimModal {...props} />);
    fireEvent.click(screen.getByText("profile_claimConfirmCta"));
    expect(await screen.findByText("profile_claimFailed")).toBeInTheDocument();
  });

  it("提交期间关闭按钮禁用、点遮罩不关闭", async () => {
    let release: (() => void) | undefined;
    apiMock.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<SupplierClaimModal {...props} />);

    const overlay = screen.getByText("profile_claimTitle").closest("div.fixed")!;
    fireEvent.click(screen.getByText("profile_claimConfirmCta"));
    fireEvent.click(overlay);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(overlay.querySelector("button")).toBeDisabled();

    release!();
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});
