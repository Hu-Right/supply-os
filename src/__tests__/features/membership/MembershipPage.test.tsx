import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MembershipPage from "@/features/membership/pages/MembershipPage";

// ── Mock VipCard ──
vi.mock("@/features/membership/components/VipCard", () => ({
  VipCard: ({ userEmail, isVip, onUpgradeClick }: any) => (
    <div data-testid="vip-card">
      <span>{userEmail || "guest"}</span>
      <span>{isVip ? "vip" : "free"}</span>
      {!isVip && <button onClick={onUpgradeClick}>upgrade</button>}
    </div>
  ),
}));

// ── Mock EmailSubscription ──
vi.mock("@/features/membership/components/EmailSubscription", () => ({
  EmailSubscription: ({ initialEmail, onSend }: any) => (
    <div data-testid="email-sub">
      <input data-testid="email-input" defaultValue={initialEmail} />
      <button onClick={() => onSend(initialEmail)}>send</button>
    </div>
  ),
}));

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// ── Mock useAuth ──
const mockAuth = { authUser: null as any, isVip: false };
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

describe("MembershipPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = null;
    mockAuth.isVip = false;
  });

  it("renders VipCard and EmailSubscription", () => {
    render(<MembershipPage />);
    expect(screen.getByTestId("vip-card")).toBeInTheDocument();
    expect(screen.getByTestId("email-sub")).toBeInTheDocument();
  });

  it("dispatches require-login when upgrade clicked (not logged in)", () => {
    const spy = vi.fn();
    window.addEventListener("supply-os:require-login", spy);
    render(<MembershipPage />);

    fireEvent.click(screen.getByText("upgrade"));
    expect(spy).toHaveBeenCalled();
    window.removeEventListener("supply-os:require-login", spy);
  });

  it("dispatches pay event when upgrade clicked (logged in)", () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com" };
    const spy = vi.fn();
    window.addEventListener("supply-os:pay", spy);
    render(<MembershipPage />);

    fireEvent.click(screen.getByText("upgrade"));
    expect(spy).toHaveBeenCalled();
    window.removeEventListener("supply-os:pay", spy);
  });

  it("does not show upgrade button for VIP user", () => {
    mockAuth.isVip = true;
    render(<MembershipPage />);
    expect(screen.queryByText("upgrade")).toBeNull();
  });
});
