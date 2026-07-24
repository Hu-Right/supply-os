import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentRecordCard } from "@/features/payment/components/PaymentRecordCard";
import { OrderHistoryList } from "@/features/payment/components/OrderHistoryList";
import { UnlockHistoryList } from "@/features/payment/components/UnlockHistoryList";
import type { OrderRecord, UnlockRecord } from "@/features/payment/api";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en" }),
}));

describe("PaymentRecordCard", () => {
  it("renders title, status and meta rows", () => {
    render(
      <PaymentRecordCard
        title="annual_manual_8800"
        statusLabel="Paid"
        statusVariant="success"
        amountLabel="¥8800"
        meta={[{ label: "Order No.", value: "ORD-1" }]}
        noticeLinkLabel="Related Notice"
      />
    );
    expect(screen.getByText("annual_manual_8800")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("¥8800")).toBeInTheDocument();
    expect(screen.getByText("ORD-1")).toBeInTheDocument();
  });

  it("renders notice as external link when url provided", () => {
    render(
      <PaymentRecordCard
        title="t"
        statusLabel="Paid"
        meta={[]}
        noticeTitle="My Notice"
        noticeUrl="https://example.com/n"
        noticeLinkLabel="Related Notice"
      />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/n");
  });

  it("renders notice as plain text when no url", () => {
    render(
      <PaymentRecordCard
        title="t"
        statusLabel="Paid"
        meta={[]}
        noticeTitle="My Notice"
        noticeLinkLabel="Related Notice"
      />
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/My Notice/)).toBeInTheDocument();
  });
});

describe("OrderHistoryList", () => {
  const orders: OrderRecord[] = [
    {
      order_no: "ORD-1",
      user_key: "uk",
      provider: "mock",
      plan_code: "annual_manual_8800",
      amount: 8800,
      currency: "CNY",
      status: "paid",
      created_at: "2026-07-01T00:00:00Z",
      notice: { id: 5, title: "Linked Notice", url: "https://example.com" },
    },
  ];

  it("maps orders and uses static status label key", () => {
    render(<OrderHistoryList orders={orders} />);
    expect(screen.getByText("annual_manual_8800")).toBeInTheDocument();
    // status "paid" -> static key
    expect(screen.getByText("myPurchasesStatus_paid")).toBeInTheDocument();
    expect(screen.getByText("¥8800")).toBeInTheDocument();
  });

  it("invokes onOpenNotice with the linked notice id for paid orders", () => {
    const onOpenNotice = vi.fn();
    render(<OrderHistoryList orders={orders} onOpenNotice={onOpenNotice} />);
    fireEvent.click(screen.getByText("myPurchasesOpenDetail"));
    expect(onOpenNotice).toHaveBeenCalledWith(5);
  });

  it("does not render open action for non-paid orders", () => {
    const onOpenNotice = vi.fn();
    render(
      <OrderHistoryList
        orders={[{ ...orders[0], status: "pending" }]}
        onOpenNotice={onOpenNotice}
      />
    );
    expect(screen.queryByText("myPurchasesOpenDetail")).not.toBeInTheDocument();
  });
});

describe("UnlockHistoryList", () => {
  const unlocks: UnlockRecord[] = [
    {
      user_key: "uk",
      notice_id: 42,
      unlock_type: "subscription",
      price: 0,
      unlocked_at: "2026-07-01T00:00:00Z",
      notice: { id: 42, title: "Unlocked Notice" },
    },
  ];

  it("maps unlocks and shows unlock type label", () => {
    render(<UnlockHistoryList unlocks={unlocks} />);
    expect(screen.getByText("Unlocked Notice")).toBeInTheDocument();
    expect(screen.getAllByText("myPurchasesUnlock_subscription").length).toBeGreaterThan(0);
  });

  it("falls back to notice id when title missing", () => {
    render(
      <UnlockHistoryList
        unlocks={[{ user_key: "uk", notice_id: 7, unlock_type: "free", price: 0 }]}
      />
    );
    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("invokes onOpenNotice with the unlock notice id", () => {
    const onOpenNotice = vi.fn();
    render(<UnlockHistoryList unlocks={unlocks} onOpenNotice={onOpenNotice} />);
    fireEvent.click(screen.getByText("myPurchasesOpenDetail"));
    expect(onOpenNotice).toHaveBeenCalledWith(42);
  });
});
