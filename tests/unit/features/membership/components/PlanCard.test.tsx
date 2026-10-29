import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { PlanCard } from "@/features/membership/components/PlanCard";
import type { ComparisonView, TieredPlanView } from "@/types";

const emptyTable = { plans: [], rows: [] } as unknown as ComparisonView;
const noop = () => {};

const mk = (over: Partial<TieredPlanView>): TieredPlanView =>
  ({
    planCode: "p_m", nameZh: "名·月", positioningZh: "位", price: "100", priceMode: "fixed",
    currency: "CNY", billingPeriodDays: 30, commercialTier: "L1",
    badge: "none", audience: "personal", periods: [], ...over,
  }) as TieredPlanView;

describe("PlanCard", () => {
  it("个人版卡显示受众角标 planAudiencePersonal", () => {
    render(<PlanCard plan={mk({ audience: "personal" })} table={emptyTable} billingDays={null} onBuy={noop} />);
    expect(screen.getByText("planAudiencePersonal")).toBeInTheDocument();
  });

  it("contact 卡按钮显示「联系咨询」并触发 onBuy", () => {
    const onBuy = vi.fn();
    render(
      <PlanCard
        plan={mk({ audience: "enterprise", priceMode: "contact" })}
        table={emptyTable}
        billingDays={null}
        onBuy={onBuy}
      />,
    );
    expect(screen.getByText("planAudienceEnterprise")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /membershipContactConsult/ });
    btn.click();
    expect(onBuy).toHaveBeenCalled();
  });

  it("周期切换：命中选中周期子行取价；未命中回退最长周期行", () => {
    const onBuy = vi.fn();
    const plan = mk({
      periods: [
        { planCode: "p_m", nameZh: "名·月", price: "239", priceMode: "fixed", currency: "CNY", billingPeriodDays: 30, badge: "none" },
        { planCode: "p_y", nameZh: "名·年", price: "1299", priceMode: "fixed", currency: "CNY", billingPeriodDays: 365, badge: "none" },
      ],
    });
    const { rerender } = render(
      <PlanCard plan={plan} table={emptyTable} billingDays={365} onBuy={onBuy} />,
    );
    expect(screen.getByText("¥1,299")).toBeInTheDocument();
    rerender(<PlanCard plan={plan} table={emptyTable} billingDays={null} onBuy={onBuy} />);
    // null（未选）→ 回退档内最长周期（年付）
    expect(screen.getByText("¥1,299")).toBeInTheDocument();
    rerender(<PlanCard plan={plan} table={emptyTable} billingDays={90} onBuy={onBuy} />);
    // 档内缺季付 → 回退最长周期，不报错
    expect(screen.getByText("¥1,299")).toBeInTheDocument();
  });
});
