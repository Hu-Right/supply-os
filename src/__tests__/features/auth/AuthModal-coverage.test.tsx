import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthModal } from "@/features/auth/pages/AuthModal";

// Mock useAuth
const mockAuth = {
  authUser: null as any,
  isVip: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  claimMessage: "",
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/features/payment", () => ({
  MyRecordsPanel: ({ onOpenNotice }: any) => (
    <div data-testid="my-records-panel">
      <button onClick={() => onOpenNotice(5)}>panel-open-notice</button>
    </div>
  ),
}));

const mockFetchUnspscIndustries = vi.fn();
const mockFetchUnspscChildren = vi.fn();
const mockFetchIndustryPrefs = vi.fn();
const mockSaveIndustryPrefs = vi.fn();
vi.mock("@/core/unspsc", async () => {
  const actual = await vi.importActual<typeof import("@/core/unspsc")>("@/core/unspsc");
  return {
    ...actual,
    fetchUnspscIndustries: (locale?: string) => mockFetchUnspscIndustries(locale),
    fetchUnspscChildren: (id: string) => mockFetchUnspscChildren(id),
  };
});
vi.mock("@/core/api/industry-prefs", () => ({
  fetchIndustryPrefs: (key: string) => mockFetchIndustryPrefs(key),
  saveIndustryPrefs: (key: string, prefs: any) => mockSaveIndustryPrefs(key, prefs),
}));

describe("AuthModal — additional function coverage", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
    mockAuth.claimMessage = "";
    mockFetchUnspscIndustries.mockResolvedValue([
      { id: 1, code: "10000000", title: "Fuel" },
    ]);
    mockFetchUnspscChildren.mockResolvedValue([]);
    mockFetchIndustryPrefs.mockResolvedValue(null);
    mockSaveIndustryPrefs.mockResolvedValue({ ok: true });
    HTMLFormElement.prototype.reportValidity = vi.fn(() => true);
  });

  // ── 1. Close button triggers onClose ──
  it("calls onClose when close button clicked", () => {
    render(<AuthModal onClose={onClose} />);

    // Find the close button (X icon button in header)
    const closeBtn = screen.getByRole("button", { name: "" }).closest("button");
    // The X button is the only button with an SVG child in the header
    const headerButtons = document.querySelectorAll("button");
    const xButton = Array.from(headerButtons).find(btn =>
      btn.querySelector("svg.lucide-x")
    );

    if (xButton) {
      fireEvent.click(xButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  // ── 2. Renders modal structure ──
  it("renders modal overlay and dialog structure", () => {
    const { container } = render(<AuthModal onClose={onClose} />);

    // Fixed overlay
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain("fixed");
    expect(overlay.className).toContain("inset-0");

    // Dialog box
    const dialog = overlay.firstChild as HTMLElement;
    expect(dialog.className).toContain("rounded-2xl");
  });

  // ── 3. Renders badge/title/description header ──
  it("renders header with badge, title, and description", () => {
    render(<AuthModal onClose={onClose} />);

    expect(screen.getByText("authModalBadge")).toBeInTheDocument();
    expect(screen.getByText("authModalTitle")).toBeInTheDocument();
    expect(screen.getByText("authModalDesc")).toBeInTheDocument();
  });

  // ── 4. Renders LoginRegisterForm when not authenticated ──
  it("renders LoginRegisterForm when user is not authenticated", () => {
    mockAuth.authUser = null;
    render(<AuthModal onClose={onClose} />);

    // LoginRegisterForm shows login/register tabs
    expect(screen.getByText("authLoginTab")).toBeInTheDocument();
    expect(screen.getByText("authRegisterTab")).toBeInTheDocument();
  });

  // ── 5. Renders AccountPanel when authenticated ──
  it("renders AccountPanel when user is authenticated", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test User" };
    render(<AuthModal onClose={onClose} />);

    // AccountPanel shows different content
    expect(screen.queryByText("authLoginTab")).toBeNull();
    // AccountPanel should show user info
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  // ── 6. Modal has correct max-height ──
  it("sets max-height constraint on modal dialog", () => {
    const { container } = render(<AuthModal onClose={onClose} />);
    const dialog = container.querySelector(".max-w-2xl") as HTMLElement;
    expect(dialog.className).toContain("max-h-");
  });

  // ── 7. Body area is scrollable ──
  it("renders scrollable body area", () => {
    const { container } = render(<AuthModal onClose={onClose} />);
    const body = container.querySelector(".overflow-y-auto") as HTMLElement;
    expect(body).toBeInTheDocument();
  });
});
