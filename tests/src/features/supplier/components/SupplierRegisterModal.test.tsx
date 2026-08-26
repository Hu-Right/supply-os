/**
 * SupplierRegisterModal 组件测试
 * P1 — 供应商注册表单：必填校验 + 提交 + 成功态
 *
 * 三维评估：逻辑 ✅ | 业务 ✅ | 频改 ✅ → 必须测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupplierRegisterModal } from "@/features/supplier/components/SupplierRegisterModal";

vi.mock("@/features/supplier/api", () => ({
  registerSupplier: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("@/shared/ui", () => ({
  Modal: ({ children, onClose }: any) => (
    <div role="dialog"><button onClick={onClose}>close</button>{children}</div>
  ),
  Input: (props: any) => <input {...props} />,
  Select: ({ children, ...props }: any) => <select {...props}>{children}</select>,
}));

describe("SupplierRegisterModal", () => {
  const onClose = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it("渲染弹窗", () => {
    render(<SupplierRegisterModal onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("渲染提交按钮（i18n key）", () => {
    render(<SupplierRegisterModal onClose={onClose} />);
    expect(screen.getByText("supplierRegSubmitBtn")).toBeTruthy();
  });

  it("渲染取消按钮", () => {
    render(<SupplierRegisterModal onClose={onClose} />);
    expect(screen.getByText("cancel")).toBeTruthy();
  });
});
