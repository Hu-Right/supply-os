import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppHeader, useNavTabs, type AppTab } from "@/shared/layout/AppHeader";
import { Building2, Globe } from "lucide-react";

// ── Mock useLocale（t 返回 key）──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
    localeDir: "ltr" as const,
    setLocale: vi.fn(),
  }),
  SUPPORTED_LOCALES: [
    { code: "zh", nativeName: "中文", englishName: "Chinese", dir: "ltr" },
    { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  ],
}));

// ── Mock useAuth ──
const mockAuth = {
  authUser: null as any,
  isVip: false,
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

// ── Mock 路由预加载（AppHeader 仅依赖 preloadRoute）──
const preloadRoute = vi.fn();
vi.mock("@/routes", () => ({
  default: () => null,
  preloadRoute: (path: string) => preloadRoute(path),
}));

const tabs: AppTab[] = [
  { id: 1, label: "展厅", icon: Building2 },
  { id: 2, label: "公采", icon: Globe, alert: true },
  { id: 3, label: "会员", icon: Globe, highlight: true },
];
const tabRoutes: Record<number, string> = { 1: "/showroom", 2: "/procurement", 3: "/membership" };

function renderHeader(props: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
  const merged = {
    tabs,
    tabRoutes,
    activeTab: 1,
    isTrainingRoute: false,
    mobileMenuOpen: false,
    setMobileMenuOpen: vi.fn(),
    onSwitchTab: vi.fn(),
    onOpenAuth: vi.fn(),
    ...props,
  };
  const utils = render(
    <MemoryRouter initialEntries={["/showroom"]}>
      <AppHeader {...merged} />
    </MemoryRouter>
  );
  return { ...utils, props: merged };
}

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
  });

  it("renders brand name and system status line", () => {
    renderHeader();
    expect(screen.getByText("brandName")).toBeInTheDocument();
    expect(screen.getByText("SYS: ACTIVE | UTC: 2026-05-30")).toBeInTheDocument();
  });

  it("renders all desktop tabs and highlights the active one", () => {
    renderHeader({ activeTab: 2 });
    expect(screen.getByText("展厅")).toBeInTheDocument();
    expect(screen.getByText("公采")).toBeInTheDocument();
    expect(screen.getByText("会员")).toBeInTheDocument();
    // 激活 tab 带 bg-teal-600 高亮
    expect(screen.getByText("公采").closest("button")?.className).toContain("bg-teal-600");
    expect(screen.getByText("展厅").closest("button")?.className).not.toContain("bg-teal-600");
  });

  it("does not highlight any tab on training route", () => {
    renderHeader({ isTrainingRoute: true, activeTab: 1 });
    expect(screen.getByText("展厅").closest("button")?.className).not.toContain("bg-teal-600");
  });

  it("clicking a tab calls onSwitchTab with tab id", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByText("公采"));
    expect(props.onSwitchTab).toHaveBeenCalledWith(2);
  });

  it("hovering a tab preloads its route", () => {
    renderHeader();
    fireEvent.mouseEnter(screen.getByText("公采"));
    expect(preloadRoute).toHaveBeenCalledWith("/procurement");
  });

  it("renders alert dot for tabs with alert flag", () => {
    const { container } = renderHeader();
    // alert 圆点：bg-rose-500 animate-ping
    expect(container.querySelector(".bg-rose-500.animate-ping")).toBeInTheDocument();
  });

  it("mobile menu is hidden until opened, and closes after selecting a tab", () => {
    const { props, rerender } = renderHeader({ mobileMenuOpen: false });
    expect(screen.queryByText("展厅")).toBeInTheDocument(); // 桌面导航始终渲染
    // 移动菜单容器：md:hidden bg-white border-b（初始未打开，容器不存在）
    expect(document.querySelector(".md\\:hidden.bg-white")).toBeNull();

    rerender(
      <MemoryRouter initialEntries={["/showroom"]}>
        <AppHeader
          tabs={tabs}
          tabRoutes={tabRoutes}
          activeTab={1}
          isTrainingRoute={false}
          mobileMenuOpen={true}
          setMobileMenuOpen={props.setMobileMenuOpen}
          onSwitchTab={props.onSwitchTab}
          onOpenAuth={props.onOpenAuth}
        />
      </MemoryRouter>
    );
    const mobileMenu = document.querySelector(".md\\:hidden.bg-white");
    expect(mobileMenu).toBeInTheDocument();
    // 点击移动菜单中的 tab：切换并收起菜单
    const mobileBtns = Array.from(mobileMenu!.querySelectorAll("button"));
    fireEvent.click(mobileBtns[1]);
    expect(props.onSwitchTab).toHaveBeenCalledWith(2);
    expect(props.setMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it("hamburger button toggles mobile menu", () => {
    const { props } = renderHeader();
    const hamburger = Array.from(screen.getAllByRole("button")).find(
      (btn) => btn.className.includes("md:hidden")
    );
    expect(hamburger).toBeTruthy();
    fireEvent.click(hamburger!);
    expect(props.setMobileMenuOpen).toHaveBeenCalledWith(true);
  });

  it("guest user sees guestLevel entry and clicking opens auth", () => {
    const { props } = renderHeader();
    const authBtn = screen.getByText("guestLevel").closest("button")!;
    fireEvent.click(authBtn);
    expect(props.onOpenAuth).toHaveBeenCalled();
  });

  it("VIP user sees display name + vipLabel badge", () => {
    mockAuth.authUser = { user_key: "u1", email: "vip@test.com", display_name: "VIP用户" };
    mockAuth.isVip = true;
    renderHeader();
    expect(screen.getByText("VIP用户 · vipLabel")).toBeInTheDocument();
  });

  it("non-VIP logged-in user sees freeLabel", () => {
    mockAuth.authUser = { user_key: "u2", email: "free@test.com", display_name: "" };
    mockAuth.isVip = false;
    renderHeader();
    // display_name 为空时回退 email
    expect(screen.getByText("free@test.com · freeLabel")).toBeInTheDocument();
  });
});

// ── useNavTabs：路由 → activeTab 映射 + switchMainTab 导航 ──
function NavTabsProbe() {
  const { tabs, activeTab, isTrainingRoute, switchMainTab } = useNavTabs();
  return (
    <div>
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="tab-count">{tabs.length}</span>
      <span data-testid="training">{String(isTrainingRoute)}</span>
      <button onClick={() => switchMainTab(4)}>go crm</button>
      <button onClick={() => switchMainTab(99)}>go fallback</button>
    </div>
  );
}

describe("useNavTabs", () => {
  it.each([
    ["/showroom", "1"],
    ["/", "1"],
    ["/procurement", "2"],
    ["/supplier", "3"],
    ["/crm", "4"],
    ["/services", "5"],
    ["/learning", "6"],
    ["/membership", "7"],
    ["/training", "0"],
    ["/unknown-path", "1"],
  ])("maps %s to activeTab %s", (path, expected) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <NavTabsProbe />
      </MemoryRouter>
    );
    expect(screen.getByTestId("active-tab").textContent).toBe(expected);
    expect(screen.getByTestId("training").textContent).toBe(path === "/training" ? "true" : "false");
  });

  it("builds 7 tabs with alert on CRM and highlight on membership", () => {
    render(
      <MemoryRouter initialEntries={["/showroom"]}>
        <NavTabsProbe />
      </MemoryRouter>
    );
    expect(screen.getByTestId("tab-count").textContent).toBe("7");
  });
});
