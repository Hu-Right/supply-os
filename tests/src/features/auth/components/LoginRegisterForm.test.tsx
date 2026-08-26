/**
 * LoginRegisterForm 组件测试
 * P0 — 登录/注册模式切换 + 找回密码视图
 *
 * 三维评估：逻辑 ✅ | 业务 ✅ | 频改 ✅ → 必须测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoginRegisterForm } from "@/features/auth/components/LoginRegisterForm";

vi.mock("@/features/auth/hooks/useAuthForm", () => ({
  useAuthForm: vi.fn(() => ({
    authMode: "login",
    setAuthMode: vi.fn(),
    authForm: { email: "", password: "", name: "" },
    setAuthForm: vi.fn(),
    authError: "",
    setAuthError: vi.fn(),
    claimMessage: "",
    claimForm: { noticeRef: "", noticeTitle: "" },
    setClaimForm: vi.fn(),
    submitAuth: vi.fn(),
  })),
}));

vi.mock("@/features/auth/hooks/useForgotPassword", () => ({
  useForgotPassword: vi.fn(() => ({
    forgotEmail: "",
    setForgotEmail: vi.fn(),
    forgotStep: 0,
    forgotCode: "",
    setForgotCode: vi.fn(),
    forgotPassword: "",
    setForgotPassword: vi.fn(),
    forgotMessage: "",
    forgotIsError: false,
    forgotLoading: false,
    handleSendResetCode: vi.fn(),
    handleResetPassword: vi.fn(),
  })),
}));

vi.mock("@/features/auth/hooks/useRegisterCode", () => ({
  useRegisterCode: vi.fn(() => ({
    registerCodeSent: false,
    registerVerifyCode: "",
    setRegisterVerifyCode: vi.fn(),
    registerCountdown: 0,
    registerLoading: false,
    handleSendCode: vi.fn(),
  })),
}));

vi.mock("@/features/auth/hooks/useUnspscPrefCascade", () => ({
  useUnspscPrefCascade: vi.fn(() => ({
    prefLevel1: "",
    prefLevel2: "",
    prefLevel3: "",
    setPrefLevel1: vi.fn(),
    setPrefLevel2: vi.fn(),
    setPrefLevel3: vi.fn(),
    resetCascade: vi.fn(),
  })),
}));

describe("LoginRegisterForm", () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染登录/注册切换按钮", () => {
    render(<LoginRegisterForm onSuccess={onSuccess} />);
    expect(screen.getByText("authLoginTab")).toBeTruthy();
    expect(screen.getByText("authRegisterTab")).toBeTruthy();
  });

  it("渲染为 form 元素", () => {
    render(<LoginRegisterForm onSuccess={onSuccess} />);
    const form = screen.getByRole("button", { name: "authLoginTab" }).closest("form");
    expect(form).toBeTruthy();
  });

  it("提交表单 → 不抛异常", () => {
    render(<LoginRegisterForm onSuccess={onSuccess} />);
    const form = screen.getByRole("button", { name: "authLoginTab" }).closest("form");
    if (form) fireEvent.submit(form);
  });
});
