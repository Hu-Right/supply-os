/**
 * shared/layout/AppHeader 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader, type AppTab } from "@/shared/layout/AppHeader";

// mock 子组件，聚焦 AppHeader 自身逻辑
vi.mock("@/shared/layout/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
}));
vi.mock("@/shared/layout/MobileDrawer", () => ({
  MobileDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mobile-drawer" /> : null,
}));

const TestIcon = () => null;

const testTabs: AppTab[] = [
  { path: "/showroom", label: "Showroom", icon: TestIcon as any },
  { path: "/procurement", label: "Procurement", icon: TestIcon as any },
];

describe("AppHeader", () => {
  const defaultProps = {
    tabs: testTabs,
    activeTab: "/showroom",
    mobileMenuOpen: false,
    setMobileMenuOpen: vi.fn(),
    onSwitchTab: vi.fn(),
    onOpenAuth: vi.fn(),
  };

  it("渲染品牌名称", () => {
    render(<AppHeader {...defaultProps} />);
    expect(screen.getByText("brandName")).toBeInTheDocument();
  });

  it("未登录 → 显示 guestLevel 按钮", () => {
    render(<AppHeader {...defaultProps} />);
    expect(screen.getByText("guestLevel")).toBeInTheDocument();
  });

  it("渲染所有导航 tabs", () => {
    render(<AppHeader {...defaultProps} />);
    expect(screen.getByText("Showroom")).toBeInTheDocument();
    expect(screen.getByText("Procurement")).toBeInTheDocument();
  });

  it("点击 tab → onSwitchTab", async () => {
    const user = userEvent.setup();
    const onSwitchTab = vi.fn();
    render(<AppHeader {...defaultProps} onSwitchTab={onSwitchTab} />);
    await user.click(screen.getByText("Showroom"));
    expect(onSwitchTab).toHaveBeenCalledWith("/showroom");
  });

  it("点击用户按钮 → onOpenAuth", async () => {
    const user = userEvent.setup();
    const onOpenAuth = vi.fn();
    render(<AppHeader {...defaultProps} onOpenAuth={onOpenAuth} />);
    await user.click(screen.getByText("guestLevel"));
    expect(onOpenAuth).toHaveBeenCalled();
  });

  it("点击汉堡菜单 → setMobileMenuOpen", async () => {
    const user = userEvent.setup();
    const setMobileMenuOpen = vi.fn();
    render(<AppHeader {...defaultProps} setMobileMenuOpen={setMobileMenuOpen} />);
    await user.click(screen.getByLabelText("打开菜单"));
    expect(setMobileMenuOpen).toHaveBeenCalledWith(true);
  });

  it("mobileMenuOpen=true → 渲染 MobileDrawer", () => {
    render(<AppHeader {...defaultProps} mobileMenuOpen={true} />);
    expect(screen.getByTestId("mobile-drawer")).toBeInTheDocument();
  });

  it("mobileMenuOpen=false → 不渲染 MobileDrawer", () => {
    render(<AppHeader {...defaultProps} mobileMenuOpen={false} />);
    expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument();
  });
});
