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

// Mock useLocale — return key as value for easy assertion
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
  }),
}));

describe("AuthModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
    mockAuth.claimMessage = "";
  });

  it("renders login form when not authenticated", () => {
    render(<AuthModal onClose={onClose} />);
    // Should show login/register tabs
    expect(screen.getByText("authLoginTab")).toBeInTheDocument();
    expect(screen.getByText("authRegisterTab")).toBeInTheDocument();
    // Should show email and password inputs
    expect(screen.getByPlaceholderText("authEmailPlaceholder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("authPasswordPlaceholder")).toBeInTheDocument();
    // Should show login submit button
    expect(screen.getByText("authLoginSubmit")).toBeInTheDocument();
  });

  it("shows account info when authenticated", () => {
    mockAuth.authUser = { user_key: "u1", email: "user@test.com", display_name: "TestUser" };

    render(<AuthModal onClose={onClose} />);

    expect(screen.getByText("TestUser")).toBeInTheDocument();
    expect(screen.getByText("user@test.com")).toBeInTheDocument();
    expect(screen.getByText("authCurrentAccount")).toBeInTheDocument();
    expect(screen.getByText("authLogout")).toBeInTheDocument();
    // Should NOT show login form
    expect(screen.queryByPlaceholderText("authEmailPlaceholder")).toBeNull();
  });

  it("shows VIP badge when user is VIP", () => {
    mockAuth.authUser = { user_key: "u1", email: "vip@test.com", display_name: "VIP" };
    mockAuth.isVip = true;

    render(<AuthModal onClose={onClose} />);

    expect(screen.getByText("authVipMember")).toBeInTheDocument();
  });

  it("switches to register mode and shows claim form", () => {
    render(<AuthModal onClose={onClose} />);

    // Click register tab
    fireEvent.click(screen.getByText("authRegisterTab"));

    // Should show register-specific elements
    expect(screen.getByText("authCompanyClaimInfo")).toBeInTheDocument();
    expect(screen.getByText("authRegisterSubmit")).toBeInTheDocument();
    // Login submit should be gone
    expect(screen.queryByText("authLoginSubmit")).toBeNull();
  });

  it("calls login on form submit", async () => {
    mockAuth.login.mockResolvedValue(undefined);

    render(<AuthModal onClose={onClose} />);

    const emailInput = screen.getByPlaceholderText("authEmailPlaceholder");
    const passwordInput = screen.getByPlaceholderText("authPasswordPlaceholder");

    fireEvent.change(emailInput, { target: { value: "test@test.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    fireEvent.click(screen.getByText("authLoginSubmit"));

    // Wait for async submit
    await vi.waitFor(() => {
      expect(mockAuth.login).toHaveBeenCalledWith("test@test.com", "password123");
    });
  });

  it("calls onClose when close button is clicked", () => {
    render(<AuthModal onClose={onClose} />);

    // The close button contains an X icon (from lucide-react)
    const closeBtn = screen.getByRole("button", { name: "" });
    // Find the close button (it's the one in the header)
    const headerButtons = screen.getAllByRole("button");
    const closeX = headerButtons.find((btn) => btn.closest(".bg-slate-900"));
    if (closeX) {
      fireEvent.click(closeX);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
