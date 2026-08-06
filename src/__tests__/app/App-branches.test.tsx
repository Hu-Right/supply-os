import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

// ── Mock modals ──
const mockAuthModalOnClose = vi.fn();
vi.mock("@/features/auth", () => ({
  AuthModal: ({ onClose }: any) => {
    mockAuthModalOnClose.mockImplementation(onClose);
    return <div data-testid="auth-modal" />;
  },
}));

const mockPaymentModalOnClose = vi.fn();
vi.mock("@/features/payment", () => ({
  PaymentModal: ({ onClose }: any) => {
    mockPaymentModalOnClose.mockImplementation(onClose);
    return <div data-testid="payment-modal" />;
  },
}));

vi.mock("@/shared/forms", () => ({
  ConsultForm: ({ onClose }: any) => (
    <div data-testid="consult-form">
      <button onClick={onClose}>close-consult</button>
    </div>
  ),
}));

// ── Mock events ──
const eventListeners: Record<string, Function[]> = {};
vi.mock("@/core/events", () => ({
  onAppEvent: (event: string, handler: Function) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
    return () => {
      eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
    };
  },
  emitAppEvent: vi.fn(),
}));

// ── Mock layout hooks ──
vi.mock("@/shared/layout", async () => {
  const actual = await vi.importActual<any>("@/shared/layout");
  return {
    ...actual,
    SessionBanner: () => <div data-testid="session-banner" />,
    AppHeader: ({ onOpenAuth }: any) => (
      <div data-testid="app-header">
        <button onClick={onOpenAuth}>open-auth</button>
      </div>
    ),
    AppFooter: () => <div data-testid="app-footer" />,
    useNavTabs: () => ({
      tabs: [],
      tabRoutes: [],
      activeTab: "showroom",
      isTrainingRoute: false,
      switchMainTab: vi.fn(),
    }),
    useAppEvents: vi.fn(),
    useAppModals: () => {
      const [showAuthModal, setShowAuthModal] = useState(false);
      const [showPaymentModal, setShowPaymentModal] = useState(false);
      const [paymentPlan, setPaymentPlan] = useState(null as any);
      const [showConsultForm, setShowConsultForm] = useState(false);
      const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
      return {
        showAuthModal, setShowAuthModal,
        showPaymentModal, setShowPaymentModal,
        paymentPlan, setPaymentPlan,
        showConsultForm, setShowConsultForm,
        mobileMenuOpen, setMobileMenuOpen,
        onRequireLogin: vi.fn(),
        onConsult: vi.fn(),
        onPay: vi.fn(),
      };
    },
    useVersionCheck: vi.fn(),
    ProtectedRoute: ({ children }: any) => children,
  };
});

function renderApp(path = "/showroom") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("App.tsx — additional branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
    Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
  });

  // ── 1. Core layout rendering ──
  it("renders header, routes, and footer", () => {
    renderApp();
    expect(screen.getByTestId("app-header")).toBeInTheDocument();
    expect(screen.getByTestId("routes")).toBeInTheDocument();
    expect(screen.getByTestId("app-footer")).toBeInTheDocument();
  });

  // ── 2. SessionBanner rendering ──
  it("renders SessionBanner component", () => {
    renderApp();
    expect(screen.getByTestId("session-banner")).toBeInTheDocument();
  });

  // ── 3. AuthModal not rendered initially ──
  it("does not render AuthModal initially", () => {
    renderApp();
    expect(screen.queryByTestId("auth-modal")).toBeNull();
  });

  // ── 4. ConsultForm not rendered initially ──
  it("does not render ConsultForm initially", () => {
    renderApp();
    expect(screen.queryByTestId("consult-form")).toBeNull();
  });

  // ── 5. PaymentModal not rendered initially ──
  it("does not render PaymentModal initially", () => {
    renderApp();
    expect(screen.queryByTestId("payment-modal")).toBeNull();
  });

  // ── 6. Main content area structure ──
  it("renders main content area with correct structure", () => {
    const { container } = renderApp();
    const main = container.querySelector("main");
    expect(main).toBeInTheDocument();
    expect(main?.className).toContain("flex-1");
  });
});
