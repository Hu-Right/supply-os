import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { PlanCard } from "@/features/membership/components/PlanCard";
import type { ComparisonView, PlanView } from "@/types";

const emptyTable = { plans: [], rows: [] } as unknown as ComparisonView;
const noop = () => {};

const mk = (over: Partial<PlanView>): PlanView =>
  ({
    planCode: "p", nameZh: "名", positioningZh: "位", price: "100", priceMode: "fixed",
    currency: "CNY", billingPeriodDays: 365, commercialTier: "L1",
    badge: "none", audience: "personal", ...over,
  }) as PlanView;

describe("PlanCard", () => {
  it("个人版卡显示受众角标 planAudiencePersonal", () => {
    render(<PlanCard plan={mk({ audience: "personal" })} table={emptyTable} onBuy={noop} />);
    expect(screen.getByText("planAudiencePersonal")).toBeInTheDocument();
  });

  it("contact 卡按钮显示「联系咨询」并触发 onBuy", () => {
    const onBuy = vi.fn();
    render(
      <PlanCard plan={mk({ audience: "enterprise", priceMode: "contact" })} table={emptyTable} onBuy={onBuy} />,
    );
    expect(screen.getByText("planAudienceEnterprise")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /membershipContactConsult/ });
    btn.click();
    expect(onBuy).toHaveBeenCalled();
  });
});
