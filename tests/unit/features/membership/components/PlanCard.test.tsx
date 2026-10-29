/**
 * 档位卡单测：周期 Tab 下的三张卡之一（个人/企业/人工），价格+权益+成交都在卡内。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { PlanCard } from "@/features/membership/components/PlanCard";
import type { ComparisonView, PlanView, ResolvedCellView, TieredPlanView } from "@/types";

const noop = () => {};

/** 周期行：定价页每张卡消费的对象（完整 PlanView） */
const row = (over: Partial<PlanView> = {}): PlanView =>
  ({
    planCode: "personal_m",
    nameEn: "personal_m",
    nameZh: "个人会员·月",
    positioningZh: "为个人投标人打造",
    price: "239",
    priceMode: "fixed",
    priceInclTax: 0,
    currency: "CNY",
    billingPeriodDays: 30,
    commercialTier: "L1",
    audience: "personal",
    ctaI18nKey: "",
    badge: "none",
    sortOrder: 2,
    isActive: 1,
    upgradeCreditDays: null,
    ...over,
  }) as PlanView;

/** 档位：代表行 + 档内周期子行 */
const tier = (periods: PlanView[], over: Partial<TieredPlanView> = {}): TieredPlanView =>
  ({ ...row(), periods, ...over }) as TieredPlanView;

/** 一张 bool 权益格（键 = 代表行 planCode） */
const tableWith = (planCode: string, label: string): ComparisonView =>
  ({
    plans: [],
    rows: [
      {
        benefit: { benefitCode: "attachment", nameZh: label, valueKind: "bool", levelDict: null, sortOrder: 1 },
        cells: {
          [planCode]: {
            planCode, benefitCode: "attachment", kind: "bool", raw: 1, enabled: true, display: "", note: null,
          } as ResolvedCellView,
        },
      },
    ],
  }) as unknown as ComparisonView;

const emptyTable = { plans: [], rows: [] } as unknown as ComparisonView;

describe("PlanCard（档位卡）", () => {
  it("卡头显示档位名，价格单位跟周期行（月卡 ¥239/月；周期由顶部 Tab 给出，卡内不重复）", () => {
    render(<PlanCard tier={tier([row()])} row={row()} table={emptyTable} onBuy={noop} />);
    expect(screen.getByText("tierPersonal")).toBeInTheDocument();
    expect(screen.getByText("为个人投标人打造")).toBeInTheDocument();
    expect(screen.getByText("¥239")).toBeInTheDocument();
    expect(screen.getByText("/membershipMonth")).toBeInTheDocument();
  });

  it("年付周期行 → ¥1,299/年，单位不串月付", () => {
    const yearRow = row({ planCode: "personal_y", price: "1299", billingPeriodDays: 365 });
    render(<PlanCard tier={tier([row(), yearRow])} row={yearRow} table={emptyTable} onBuy={noop} />);
    expect(screen.getByText("¥1,299")).toBeInTheDocument();
    expect(screen.getByText("/membershipYear")).toBeInTheDocument();
    expect(screen.queryByText("/membershipMonth")).toBeNull();
  });

  it("推荐角标只看本卡周期行的 badge（企业年付 most_popular）", () => {
    const monthRow = row();
    const yearRow = row({ planCode: "business_y", price: "1299", billingPeriodDays: 365, badge: "most_popular" });
    const t = tier([monthRow, yearRow]);
    const { unmount } = render(<PlanCard tier={t} row={monthRow} table={emptyTable} onBuy={noop} />);
    expect(screen.queryByText("membershipRecommended")).toBeNull();
    unmount();

    render(<PlanCard tier={t} row={yearRow} table={emptyTable} onBuy={noop} />);
    expect(screen.getByText("membershipRecommended")).toBeInTheDocument();
  });

  it("卡内权益清单按代表行 planCode 读矩阵（同档各周期共用一份）", () => {
    render(
      <PlanCard
        tier={tier([row()], { planCode: "personal_m" })}
        row={row({ planCode: "personal_y", billingPeriodDays: 365, price: "1299" })}
        table={tableWith("personal_m", "附件下载")}
        onBuy={noop}
      />,
    );
    expect(screen.getByText("附件下载")).toBeInTheDocument();
  });

  it("AI 智能匹配不展示无功能差异的档位标签，bool 行不展示等级", () => {
    const table = {
      plans: [],
      rows: [
        {
          benefit: { benefitCode: "ai_match", nameZh: "AI 智能匹配", valueKind: "enum", levelDict: { "3": "企业级" }, sortOrder: 1 },
          cells: {
            personal_m: {
              planCode: "personal_m", benefitCode: "ai_match", kind: "enum",
              raw: 3, enabled: true, display: "企业级", note: null,
            },
          },
        },
        {
          benefit: { benefitCode: "a", nameZh: "普通权益", valueKind: "bool", levelDict: null, sortOrder: 2 },
          cells: {
            personal_m: {
              planCode: "personal_m", benefitCode: "a", kind: "bool",
              raw: 1, enabled: true, display: "✓", note: null,
            },
          },
        },
      ],
    } as unknown as ComparisonView;

    render(<PlanCard tier={tier([row()])} row={row()} table={table} onBuy={noop} />);
    expect(screen.getByText("AI 智能匹配")).toBeInTheDocument();
    expect(screen.queryByText("企业级")).not.toBeInTheDocument();
    // bool 行的 display 是 ✓，不再重复渲染等级标签
    expect(screen.getByText("普通权益")).toBeInTheDocument();
    expect(screen.queryAllByText("✓")).toHaveLength(0);
  });

  it("全部权益平铺：✓ 与 ✗ 都展示（不折叠、不隐藏）", () => {
    const cell = (benefitCode: string, enabled: boolean) => ({
      planCode: "personal_m", benefitCode, kind: "bool" as const, raw: enabled ? 1 : 0, enabled, display: "", note: null,
    });
    const table = {
      plans: [],
      rows: [
        {
          benefit: { benefitCode: "a", nameZh: "已包含项", valueKind: "bool", levelDict: null, sortOrder: 1 },
          cells: { personal_m: cell("a", true) },
        },
        {
          benefit: { benefitCode: "b", nameZh: "未包含项", valueKind: "bool", levelDict: null, sortOrder: 2 },
          cells: { personal_m: cell("b", false) },
        },
      ],
    } as unknown as ComparisonView;

    render(<PlanCard tier={tier([row()])} row={row()} table={table} onBuy={noop} />);
    expect(screen.getByText("已包含项")).toBeInTheDocument();
    expect(screen.getByText("未包含项")).toBeInTheDocument(); // ✗ 行也平铺展示
    expect(screen.getAllByTestId("benefit-list")).toHaveLength(1);
  });

  it("功能未完善的权益照常展示，但页面不渲染「即将上线」角标（2026-10-29 产品口径）", () => {
    const table = {
      plans: [],
      rows: [
        {
          benefit: {
            benefitCode: "enterprise_profile", nameZh: "企业能力画像", valueKind: "bool",
            levelDict: null, sortOrder: 1, isComingSoon: true,
          },
          cells: {
            personal_m: {
              planCode: "personal_m", benefitCode: "enterprise_profile", kind: "bool",
              raw: 1, enabled: true, display: "", note: null,
            },
          },
        },
      ],
    } as unknown as ComparisonView;

    render(<PlanCard tier={tier([row()])} row={row()} table={table} onBuy={noop} />);
    // 权益名照常展示
    expect(screen.getByText("企业能力画像")).toBeInTheDocument();
    // 角标不渲染（i18n key 已删除，任何「即将上线」文本都不应出现）
    expect(screen.queryByText("planBenefitsComingSoon")).toBeNull();
    expect(screen.queryByText(/即将上线/)).toBeNull();
  });

  it("contact 周期显示「联系咨询」并触发 onBuy", () => {
    const onBuy = vi.fn();
    const contactRow = row({ planCode: "p_c", priceMode: "contact" });
    render(<PlanCard tier={tier([contactRow])} row={contactRow} table={emptyTable} onBuy={onBuy} />);
    screen.getByRole("button", { name: /membershipContactConsult/ }).click();
    expect(onBuy).toHaveBeenCalledWith(contactRow);
  });

  it("固定价周期显示「立即购买」并触发 onBuy", () => {
    const onBuy = vi.fn();
    const monthRow = row();
    render(<PlanCard tier={tier([monthRow])} row={monthRow} table={emptyTable} onBuy={onBuy} />);
    screen.getByRole("button", { name: /membershipBuyNow/ }).click();
    expect(onBuy).toHaveBeenCalledWith(monthRow);
  });

  it("明码价高于当前订阅 → 升级补差；抵扣窗口已关 → 按原价开通", () => {
    const onUpgrade = vi.fn();
    const onBuy = vi.fn();
    const yearRow = row({ planCode: "personal_y", price: "1299", billingPeriodDays: 365 });
    const t = tier([yearRow]);
    const { unmount } = render(
      <PlanCard tier={t} row={yearRow} table={emptyTable} currentPlanPrice={239} currentPlanCode="personal_m" onBuy={onBuy} onUpgrade={onUpgrade} />,
    );
    screen.getByRole("button", { name: /upgradeBtn/ }).click();
    expect(onUpgrade).toHaveBeenCalledWith(yearRow);
    unmount();

    render(
      <PlanCard
        tier={t} row={yearRow} table={emptyTable} currentPlanPrice={239} currentPlanCode="personal_m"
        upgradeCreditOpen={false} onBuy={onBuy} onUpgrade={onUpgrade}
      />,
    );
    expect(screen.getByRole("button", { name: /upgradeBuyNewBtn/ })).toBeInTheDocument();
  });

  it("当前订阅价不低于本卡 → 展示「已是 VIP」", () => {
    render(<PlanCard tier={tier([row()])} row={row()} table={emptyTable} currentPlanPrice={1299} currentPlanCode="personal_y" onBuy={noop} />);
    expect(screen.getByText("membershipAlreadyVip")).toBeInTheDocument();
  });
});
