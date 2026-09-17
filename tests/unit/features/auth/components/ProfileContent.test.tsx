import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── 隔离 mock：i18n / auth / 会员等级 / 重子组件 ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// ProfileContent 使用 next/navigation 的 useRouter，测试环境需打桩
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings/profile",
}));

const mockLogout = vi.fn();
const mockRefreshAuth = vi.fn(() => Promise.resolve());
let mockAuthUser: { nickname: string; email: string; supplier_id: number | null } | null = {
  nickname: "测试昵称",
  email: "test@example.com",
  supplier_id: 42,
};
let mockIsVip = true;

vi.mock("@/core/auth", () => ({
  useAuth: () => ({
    authUser: mockAuthUser,
    isVip: mockIsVip,
    logout: mockLogout,
    claimMessage: "",
    refreshAuth: mockRefreshAuth,
  }),
  useUserId: () => mockAuthUser ? 1 : undefined,
}));

vi.mock("@/shared/hooks/useMembershipTier", () => ({
  useMembershipTier: () => ({ tierLabel: "基础版" }),
}));

// 重子组件打桩，聚焦 ProfileContent 自身的编排与守卫
vi.mock("@/features/auth/components/NicknameEditor", () => ({
  NicknameEditor: () => <div data-testid="nickname-editor" />,
}));
vi.mock("@/features/auth/components/PhoneBinding", () => ({
  PhoneBinding: () => <div data-testid="phone-binding" />,
}));
vi.mock("@/features/auth/components/EmailBinding", () => ({
  EmailBinding: () => <div data-testid="email-binding" />,
}));
vi.mock("@/features/auth/components/IndustryPrefsForm", () => ({
  IndustryPrefsForm: () => <div data-testid="industry-prefs" />,
}));
vi.mock("@/features/auth/components/AccountBenefitsCard", () => ({
  AccountBenefitsCard: () => <div data-testid="benefits-card" />,
}));
vi.mock("@/features/payment", () => ({
  MyRecordsPanel: () => <div data-testid="my-records" />,
}));

import { ProfileContent } from "@/features/auth/components/ProfileContent";

describe("ProfileContent", () => {
  beforeEach(() => {
    mockLogout.mockClear();
    mockRefreshAuth.mockClear();
    mockAuthUser = { nickname: "测试昵称", email: "test@example.com", supplier_id: 42 };
    mockIsVip = true;
  });

  it("已登录渲染账号信息卡（昵称 + 邮箱 + 会员徽章）", () => {
    render(<ProfileContent />);
    expect(screen.getByText("测试昵称")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("基础版")).toBeInTheDocument();
  });

  it("渲染全部子区块（昵称/手机/邮箱/行业偏好/我的记录）", () => {
    render(<ProfileContent />);
    expect(screen.getByTestId("nickname-editor")).toBeInTheDocument();
    expect(screen.getByTestId("phone-binding")).toBeInTheDocument();
    expect(screen.getByTestId("email-binding")).toBeInTheDocument();
    expect(screen.getByTestId("industry-prefs")).toBeInTheDocument();
    expect(screen.getByTestId("my-records")).toBeInTheDocument();
    expect(screen.getByTestId("benefits-card")).toBeInTheDocument();
  });

  it("渲染供应商认证状态与退出登录按钮", () => {
    render(<ProfileContent />);
    // 退出行标题 + 按钮均含 authLogout，允许多个匹配
    expect(screen.getAllByText("authLogout").length).toBeGreaterThan(0);
    // supplier_id=42 → 已认证文案 key
    expect(screen.getByText("authSupplierVerified")).toBeInTheDocument();
  });

  it("非 VIP 显示免费会员徽章兜底", () => {
    mockIsVip = false;
    render(<ProfileContent />);
    expect(screen.getByText("authFreeMember")).toBeInTheDocument();
  });

  it("未登录返回 null（登录守卫）", () => {
    mockAuthUser = null;
    const { container } = render(<ProfileContent />);
    expect(container.firstChild).toBeNull();
  });
});
