import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MembershipPage from "@/features/membership/pages/MembershipPage";

// ── Mock membership api（套餐价格校准） ──
const mockFetchPlans = vi.fn();
vi.mock("@/features/membership/api", () => ({
  fetchPlans: () => mockFetchPlans(),
}));

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
    // 默认：套餐拉取返回空（走兜底价）
    mockFetchPlans.mockResolvedValue([]);
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
    // 套餐拉取返回空 → 使用兜底价 annual_8800 / 8800
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ code: "annual_8800", price: 8800, currency: "CNY" });
    window.removeEventListener("supply-os:pay", spy);
  });

  it("calibrates pay price from DB plans before dispatching", async () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com" };
    mockFetchPlans.mockResolvedValue([
      { plan_code: "annual_8800", name: "年度顾问服务", price: 9900, currency: "CNY" },
    ]);
    const spy = vi.fn();
    window.addEventListener("supply-os:pay", spy);
    render(<MembershipPage />);

    // 等待异步校准生效
    await waitFor(() => expect(mockFetchPlans).toHaveBeenCalled());
    fireEvent.click(screen.getByText("upgrade"));

    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ code: "annual_8800", price: 9900 });
    window.removeEventListener("supply-os:pay", spy);
  });

  it("falls back to default price when plan fetch fails", async () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com" };
    mockFetchPlans.mockRejectedValue(new Error("network"));
    const spy = vi.fn();
    window.addEventListener("supply-os:pay", spy);
    render(<MembershipPage />);

    await waitFor(() => expect(mockFetchPlans).toHaveBeenCalled());
    fireEvent.click(screen.getByText("upgrade"));

    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ code: "annual_8800", price: 8800 });
    window.removeEventListener("supply-os:pay", spy);
  });

  it("does not show upgrade button for VIP user", () => {
    mockAuth.isVip = true;
    render(<MembershipPage />);
    expect(screen.queryByText("upgrade")).toBeNull();
  });
});
