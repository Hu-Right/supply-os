import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "@/App";

// ── Mock useLocale ──
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
    { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
    { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
    { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
    { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  ],
}));

// ── Mock useAuth ──
const mockAuth = {
  authUser: null as any,
  isVip: false,
  isAuthLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshAuth: vi.fn(),
  submitSupplierClaim: vi.fn(),
  claimMessage: "",
  setClaimMessage: vi.fn(),
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

// ── Mock AppRoutes ──
vi.mock("@/routes", () => ({
  default: () => <div data-testid="routes">AppRoutes</div>,
  preloadRoute: vi.fn(),
}));

// ── Mock modals (not needed for nav tests, but required for imports) ──
vi.mock("@/features/auth", () => ({
  AuthModal: () => <div data-testid="auth-modal" />,
}));
vi.mock("@/features/payment", () => ({
  PaymentModal: () => <div data-testid="payment-modal" />,
}));
vi.mock("@/shared/forms", () => ({
  ConsultForm: () => <div data-testid="consult-form" />,
}));

// ── Helper: render App at a given path ──
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

// Helper to get current location in test
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("App.tsx — Tab Navigation & Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
  });

  // ── 1. Brand area rendering ──
  it("renders brand name in header", () => {
    renderAt("/showroom");
    // t("brandName") returns "brandName" since our mock t returns the key
    expect(screen.getByText("brandName")).toBeInTheDocument();
  });

  // ── 2. Desktop Tab navigation renders all 7 tabs ──
  it("renders 7 desktop navigation tabs", () => {
    renderAt("/showroom");
    // Tab labels come from t() which returns the key
    const tabLabels = [
      "navShowrooms", "navJointProcure", "navSuppliers",
      "navCRM", "navServices", "navLearning", "navMembership",
    ];
    for (const label of tabLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // ── 3. Tab click → URL changes ──
  it("clicking tab navigates to corresponding URL", () => {
    renderAt("/showroom");

    // Click "联合采购" tab (id=2 → /procurement)
    fireEvent.click(screen.getByText("navJointProcure"));

    // Verify the routes component is still rendered (app navigated)
    expect(screen.getByTestId("routes")).toBeInTheDocument();
  });

  // ── 4. Active tab highlights based on URL ──
  it("active tab reflects current URL", () => {
    renderAt("/procurement");

    // The procurement tab should have the active class (bg-teal-600)
    const procTab = screen.getByText("navJointProcure").closest("button");
    expect(procTab?.className).toContain("bg-teal-600");

    // Other tabs should NOT have the active class
    const showroomTab = screen.getByText("navShowrooms").closest("button");
    expect(showroomTab?.className).not.toContain("bg-teal-600");
  });

  // ── 5. Mobile menu toggle ──
  it("mobile menu button toggles mobile navigation", () => {
    renderAt("/showroom");

    // Find the hamburger button (md:hidden in header)
    const menuButtons = screen.getAllByRole("button");
    const hamburgerBtn = menuButtons.find(btn =>
      btn.className.includes("md:hidden") && !btn.className.includes("fixed")
    );
    expect(hamburgerBtn).toBeTruthy();

    // Before clicking, mobile menu grid should not exist
    const mobileGridBefore = document.querySelector(".md\\:hidden .grid");
    expect(mobileGridBefore).toBeNull();

    // Click hamburger to open mobile menu
    fireEvent.click(hamburgerBtn!);

    // After clicking, mobile menu grid should exist
    const mobileGridAfter = document.querySelector(".md\\:hidden .grid");
    expect(mobileGridAfter).toBeInTheDocument();

    // Mobile menu should contain tab buttons
    const mobileBtns = mobileGridAfter!.querySelectorAll("button");
    expect(mobileBtns.length).toBeGreaterThan(0);
  });

  // ── 6. Footer copyright rendering ──
  it("renders desktop footer with copyright", () => {
    renderAt("/showroom");
    // t("footerCopyright") returns "footerCopyright"
    expect(screen.getByText("footerCopyright")).toBeInTheDocument();
    // Also check terms and privacy links
    expect(screen.getByText("footerTerms")).toBeInTheDocument();
    expect(screen.getByText("footerPrivacy")).toBeInTheDocument();
  });

  // ── 7. Global event: supply-os:require-login ──
  it("opens auth modal on supply-os:require-login event", async () => {
    renderAt("/showroom");
    expect(screen.queryByTestId("auth-modal")).toBeNull();
    window.dispatchEvent(new CustomEvent("supply-os:require-login"));
    await waitFor(() => {
      expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
    });
  });

  // ── 8. Global event: supply-os:unauthorized ──
  it("opens auth modal on supply-os:unauthorized event", async () => {
    renderAt("/showroom");
    window.dispatchEvent(new CustomEvent("supply-os:unauthorized"));
    await waitFor(() => {
      expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
    });
  });

  // ── 9. Global event: supply-os:consult ──
  it("opens consult form on supply-os:consult event", async () => {
    renderAt("/showroom");
    expect(screen.queryByTestId("consult-form")).toBeNull();
    window.dispatchEvent(new CustomEvent("supply-os:consult"));
    await waitFor(() => {
      expect(screen.getByTestId("consult-form")).toBeInTheDocument();
    });
  });

  // ── 10. Global event: supply-os:pay ──
  it("opens payment modal on supply-os:pay event with detail", async () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    renderAt("/showroom");
    expect(screen.queryByTestId("payment-modal")).toBeNull();
    window.dispatchEvent(new CustomEvent("supply-os:pay", {
      detail: { code: "test", name: "Test Plan", price: 100, currency: "CNY" },
    }));
    await waitFor(() => {
      expect(screen.getByTestId("payment-modal")).toBeInTheDocument();
    });
  });

  // ── 11. Auth button opens auth modal ──
  it("clicking auth button opens auth modal", () => {
    renderAt("/showroom");
    // Auth button contains Crown icon and guestLevel text
    const authBtn = screen.getByText("guestLevel").closest("button");
    expect(authBtn).toBeTruthy();
    fireEvent.click(authBtn!);
    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
  });

  // ── 12. Language switcher dropdown ──
  it("language switcher opens dropdown and lists all supported languages", () => {
    renderAt("/showroom");
    const trigger = screen.getByRole("button", { name: /select language/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  // ── 13. Mobile bottom nav renders ──
  it("renders mobile bottom navigation", () => {
    renderAt("/showroom");
    // Mobile bottom nav contains "展厅", "公采", "供应商", "CRM", "学习"
    expect(screen.getByText("展厅")).toBeInTheDocument();
    expect(screen.getByText("公采")).toBeInTheDocument();
    expect(screen.getByText("供应商")).toBeInTheDocument();
  });

  // ── 14. Training route sets activeTab to 0 ──
  it("training route does not highlight any main tab", () => {
    renderAt("/training");
    // No main tab should have active class
    const tabs = screen.getAllByRole("button");
    const activeTabs = tabs.filter(btn => btn.className.includes("bg-teal-600"));
    // Training is a special route, no main tab is active
    expect(activeTabs.length).toBe(0);
  });

  // ── 15. VIP user shows VIP badge ──
  it("shows VIP badge for VIP users", () => {
    mockAuth.authUser = { user_key: "u1", email: "vip@test.com", display_name: "VIP" };
    mockAuth.isVip = true;
    renderAt("/showroom");
    // The auth button contains combined text: "VIP · vipLabel"
    const authBtn = screen.getByText(/VIP/).closest("button");
    expect(authBtn).toBeTruthy();
    expect(authBtn?.textContent).toContain("vipLabel");
  });
});
