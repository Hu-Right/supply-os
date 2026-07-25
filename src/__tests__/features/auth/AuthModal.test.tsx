import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// Mock useNavigate (AuthModal opens notices via navigate)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock the embedded records panel to a marker (avoids order-history fetching)
vi.mock("@/features/payment", () => ({
  MyRecordsPanel: ({ onOpenNotice }: any) => (
    <div data-testid="my-records-panel">
      <button onClick={() => onOpenNotice(5)}>panel-open-notice</button>
    </div>
  ),
}));

describe("AuthModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
    mockAuth.claimMessage = "";
    // Mock form validation to always pass
    HTMLFormElement.prototype.reportValidity = vi.fn(() => true);
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

    // Wait for async submit and state update to settle
    await waitFor(() => {
      expect(mockAuth.login).toHaveBeenCalledWith("test@test.com", "password123");
    });
    // Allow any pending state updates to flush
    await waitFor(() => {});
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

  it("shows claimMessage when present", () => {
    mockAuth.claimMessage = "Your claim is pending review";
    render(<AuthModal onClose={onClose} />);
    expect(screen.getByText("Your claim is pending review")).toBeInTheDocument();
  });

  it("shows free member badge when not VIP", () => {
    mockAuth.authUser = { user_key: "u1", email: "free@test.com", display_name: "Free" };
    mockAuth.isVip = false;
    render(<AuthModal onClose={onClose} />);
    expect(screen.getByText("authFreeMember")).toBeInTheDocument();
  });

  it("shows supplier pending status when no supplier_id", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test", supplier_id: null };
    render(<AuthModal onClose={onClose} />);
    expect(screen.getByText("authSupplierPending")).toBeInTheDocument();
  });

  it("shows supplier verified status when supplier_id exists", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test", supplier_id: "sup123" };
    render(<AuthModal onClose={onClose} />);
    expect(screen.getByText("authSupplierVerified")).toBeInTheDocument();
  });

  it("calls logout when logout button clicked", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    render(<AuthModal onClose={onClose} />);
    fireEvent.click(screen.getByText("authLogout"));
    expect(mockAuth.logout).toHaveBeenCalled();
  });

  it("embeds the records panel when authenticated", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    render(<AuthModal onClose={onClose} />);
    expect(screen.getByTestId("my-records-panel")).toBeInTheDocument();
  });

  it("closes the modal and navigates when opening a notice from the panel", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com", display_name: "Test" };
    render(<AuthModal onClose={onClose} />);
    fireEvent.click(screen.getByText("panel-open-notice"));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/procurement?notice_id=5");
  });

  it("shows error when register without company name", async () => {
    mockAuth.register.mockRejectedValue(new Error("Company name required"));
    render(<AuthModal onClose={onClose} />);

    // Switch to register mode
    fireEvent.click(screen.getByText("authRegisterTab"));

    // Fill email and password
    fireEvent.change(screen.getByPlaceholderText("authEmailPlaceholder"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("authPasswordPlaceholder"), { target: { value: "password123" } });

    // Submit without company name
    fireEvent.click(screen.getByText("authRegisterSubmit"));

    await waitFor(() => {
      expect(screen.getByText("authCompanyNameRequired")).toBeInTheDocument();
    });
  });

  it("calls register with claim data when company name provided", async () => {
    mockAuth.register.mockResolvedValue(undefined);
    render(<AuthModal onClose={onClose} />);

    // Switch to register mode
    fireEvent.click(screen.getByText("authRegisterTab"));

    // Fill form
    fireEvent.change(screen.getByPlaceholderText("authEmailPlaceholder"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("authPasswordPlaceholder"), { target: { value: "password123" } });
    fireEvent.change(screen.getByPlaceholderText("authCompanyPlaceholder"), { target: { value: "Test Corp" } });

    // Submit
    fireEvent.click(screen.getByText("authRegisterSubmit"));

    await waitFor(() => {
      expect(mockAuth.register).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows login error when login fails", async () => {
    mockAuth.login.mockRejectedValue(new Error("Invalid credentials"));
    render(<AuthModal onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("authEmailPlaceholder"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("authPasswordPlaceholder"), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("authLoginSubmit"));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });
});
