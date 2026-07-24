import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
  authUser: { user_key: "u1", email: "test@test.com", display_name: "Test" },
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

// ── Mock modals & forms with identifiable markers ──
vi.mock("@/features/auth", () => ({
  AuthModal: ({ onClose }: any) => (
    <div data-testid="auth-modal">
      AuthModal
      <button data-testid="auth-close" onClick={onClose}>close</button>
    </div>
  ),
}));

vi.mock("@/features/payment", () => ({
  PaymentModal: ({ onClose }: any) => (
    <div data-testid="payment-modal">
      PaymentModal
      <button data-testid="payment-close" onClick={onClose}>close</button>
    </div>
  ),
}));

vi.mock("@/shared/forms", () => ({
  ConsultForm: ({ onClose }: any) => (
    <div data-testid="consult-form">
      ConsultForm
      <button data-testid="consult-close" onClick={onClose}>close</button>
    </div>
  ),
}));

// ── Router wrapper ──
import { MemoryRouter } from "react-router-dom";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/showroom"]}>
      <App />
    </MemoryRouter>
  );
}

describe("Global Event Bus (App.tsx)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    mockAuth.isVip = false;
  });

  // ── 1. supply-os:unauthorized → AuthModal ──
  it("supply-os:unauthorized → shows AuthModal", () => {
    renderApp();
    expect(screen.queryByTestId("auth-modal")).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("supply-os:unauthorized"));
    });

    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
  });

  // ── 2. supply-os:require-login → AuthModal ──
  it("supply-os:require-login → shows AuthModal", () => {
    renderApp();
    expect(screen.queryByTestId("auth-modal")).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("supply-os:require-login"));
    });

    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
  });

  // ── 3. supply-os:require-vip → AuthModal ──
  it("supply-os:require-vip → shows AuthModal", () => {
    renderApp();
    expect(screen.queryByTestId("auth-modal")).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("supply-os:require-vip"));
    });

    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
  });

  // ── 4. supply-os:consult → ConsultForm ──
  it("supply-os:consult → shows ConsultForm", () => {
    renderApp();
    expect(screen.queryByTestId("consult-form")).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("supply-os:consult"));
    });

    expect(screen.getByTestId("consult-form")).toBeInTheDocument();
  });

  // ── 5. supply-os:pay → PaymentModal ──
  it("supply-os:pay → shows PaymentModal with plan detail", () => {
    renderApp();
    expect(screen.queryByTestId("payment-modal")).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("supply-os:pay", {
          detail: { code: "annual_8800", name: "年度会员", price: 8800, currency: "CNY" },
        })
      );
    });

    expect(screen.getByTestId("payment-modal")).toBeInTheDocument();
  });
});
