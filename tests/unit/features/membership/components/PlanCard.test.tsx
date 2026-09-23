import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { PlanCard } from "@/features/membership/components/PlanCard";
import type { ComparisonTable, PlanCatalogRow } from "@/types";

const emptyTable = { plans: [], rows: [] } as unknown as ComparisonTable;
const noop = () => {};

const mk = (over: Partial<PlanCatalogRow>): PlanCatalogRow =>
  ({
    plan_code: "p", name_zh: "名", positioning_zh: "位", price: "100", price_mode: "fixed",
    currency: "CNY", billing_period_days: 365, seat_limit: 1, commercial_tier: "L1",
    badge: "none", audience: "personal", ...over,
  }) as PlanCatalogRow;

describe("PlanCard", () => {
  it("个人版卡显示受众角标 planAudiencePersonal", () => {
    render(<PlanCard plan={mk({ audience: "personal" })} table={emptyTable} onBuy={noop} />);
    expect(screen.getByText("planAudiencePersonal")).toBeInTheDocument();
  });

  it("contact 卡按钮显示「联系咨询」并触发 onBuy", () => {
    const onBuy = vi.fn();
    render(
      <PlanCard plan={mk({ audience: "enterprise", price_mode: "contact" })} table={emptyTable} onBuy={onBuy} />,
    );
    expect(screen.getByText("planAudienceEnterprise")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /membershipContactConsult/ });
    btn.click();
    expect(onBuy).toHaveBeenCalled();
  });
});
