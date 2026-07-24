import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VipCard } from "@/features/membership/components/VipCard";
import { EmailSubscription } from "@/features/membership/components/EmailSubscription";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// ── Mock VIP_PRIVILEGES ──
vi.mock("@/features/membership/data", () => ({
  VIP_PRIVILEGES: [
    { titleKey: "priv1Title", descKey: "priv1Desc" },
    { titleKey: "priv2Title", descKey: "priv2Desc" },
  ],
}));

describe("VipCard", () => {
  const onUpgradeClick = vi.fn();

  it("renders VIP badge and title", () => {
    render(<VipCard userEmail="test@test.com" isVip={false} onUpgradeClick={onUpgradeClick} />);
    expect(screen.getByText("GOLD VIP ACCESS PANEL")).toBeInTheDocument();
    expect(screen.getByText("memberGoldTitle")).toBeInTheDocument();
  });

  it("shows user email", () => {
    render(<VipCard userEmail="vip@test.com" isVip={false} onUpgradeClick={onUpgradeClick} />);
    expect(screen.getByText("vip@test.com")).toBeInTheDocument();
  });

  it("shows upgrade button when not VIP", () => {
    render(<VipCard userEmail="test@test.com" isVip={false} onUpgradeClick={onUpgradeClick} />);
    const btn = screen.getByText("upgradeToVip");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onUpgradeClick).toHaveBeenCalled();
  });

  it("shows already VIP badge when isVip is true", () => {
    render(<VipCard userEmail="vip@test.com" isVip={true} onUpgradeClick={onUpgradeClick} />);
    expect(screen.getByText("alreadyVip")).toBeInTheDocument();
    expect(screen.queryByText("upgradeToVip")).toBeNull();
  });

  it("renders VIP privileges", () => {
    render(<VipCard userEmail="test@test.com" isVip={false} onUpgradeClick={onUpgradeClick} />);
    expect(screen.getByText("priv1Title")).toBeInTheDocument();
    expect(screen.getByText("priv2Title")).toBeInTheDocument();
  });
});

describe("EmailSubscription", () => {
  const onSend = vi.fn();

  it("renders subscription form", () => {
    render(<EmailSubscription initialEmail="" onSend={onSend} />);
    expect(screen.getByText("membershipQuestionTitle")).toBeInTheDocument();
    expect(screen.getByText("membershipSendFree")).toBeInTheDocument();
  });

  it("shows initial email in input", () => {
    render(<EmailSubscription initialEmail="pre@test.com" onSend={onSend} />);
    const input = screen.getByPlaceholderText("name@company.com") as HTMLInputElement;
    expect(input.value).toBe("pre@test.com");
  });

  it("calls onSend with email when button clicked", () => {
    render(<EmailSubscription initialEmail="" onSend={onSend} />);
    const input = screen.getByPlaceholderText("name@company.com");
    fireEvent.input(input, { target: { value: "new@test.com" } });
    fireEvent.click(screen.getByText("membershipSendFree"));
    expect(onSend).toHaveBeenCalledWith("new@test.com");
  });
});
