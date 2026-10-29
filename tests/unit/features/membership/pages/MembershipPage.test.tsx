/**
 * 会员定价页布局测试：**顶部「月 / 季度 / 年」三个周期 Tab，每 Tab 下三张档位卡**
 * （个人版 → 企业版 → 人工对接，价格+权益+成交都在卡内）。
 *
 * 这里钉住页面级验收标准：周期 Tab 由目录字段派生且顺序正确、每个 Tab 下恰好三张卡、
 * 切 Tab 只换价格/周期文案（不换权益矩阵键）、年度 Tab 只有企业年付带推荐角标。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const mockData = vi.hoisted(() => {
  const plan = (over: Record<string, unknown>) => ({
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
  });
  const period = (code: string, tierCode: string, days: number, price: string, badge = "none") =>
    plan({
      planCode: `${code}_${days === 30 ? "m" : days === 90 ? "q" : "y"}`,
      nameZh: `${code}·${days}天`,
      price,
      commercialTier: tierCode,
      billingPeriodDays: days,
      badge,
    });

  const personal = {
    ...plan({}),
    periods: [period("personal", "L1", 30, "239"), period("personal", "L1", 90, "499"), period("personal", "L1", 365, "1299")],
  };
  const business = {
    ...plan({ planCode: "business_m", commercialTier: "L3", audience: "enterprise", price: "780" }),
    periods: [period("business", "L3", 30, "780"), period("business", "L3", 90, "1680"), period("business", "L3", 365, "4800", "most_popular")],
  };
  const concierge = {
    ...plan({ planCode: "concierge_m", commercialTier: "L4", audience: "enterprise", price: "2400" }),
    periods: [period("concierge", "L4", 30, "2400"), period("concierge", "L4", 90, "5800"), period("concierge", "L4", 365, "16800")],
  };

  const boolCell = (planCode: string, benefitCode: string, enabled: boolean) => ({
    planCode, benefitCode, kind: "bool", raw: enabled ? 1 : 0, enabled, display: "", note: null,
  });
  const comparison = {
    plans: [personal, business, concierge],
    rows: [
      {
        benefit: { benefitCode: "attachment", nameZh: "标书文件下载", valueKind: "bool", levelDict: null, sortOrder: 1 },
        cells: {
          personal_m: boolCell("personal_m", "attachment", true),
          business_m: boolCell("business_m", "attachment", true),
          concierge_m: boolCell("concierge_m", "attachment", false),
        },
      },
      {
        // 已分配但未上线：企业/人工 ✓（带「即将上线」角标），个人 ✗
        benefit: {
          benefitCode: "enterprise_profile", nameZh: "企业能力画像", valueKind: "bool",
          levelDict: null, sortOrder: 2, isComingSoon: true,
        },
        cells: {
          personal_m: boolCell("personal_m", "enterprise_profile", false),
          business_m: boolCell("business_m", "enterprise_profile", true),
          concierge_m: boolCell("concierge_m", "enterprise_profile", true),
        },
      },
    ],
  };
  return { plans: [personal, business, concierge], comparison };
});

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));
vi.mock("@/core/auth", () => ({ useAuth: () => ({ authUser: null }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/core/events", () => ({ emitAppEvent: vi.fn() }));
vi.mock("@/features/membership/hooks/useMembershipData", () => ({
  useMembershipData: () => ({
    plans: mockData.plans,
    comparison: mockData.comparison,
    loading: false,
    error: null,
    currentPlanCode: null,
    currentPlanPrice: null,
    upgradeCredit: null,
    annualCredit: null,
  }),
}));
vi.mock("@/features/membership/hooks/useMembershipPayment", () => ({
  useMembershipPayment: () => ({
    buyPlan: vi.fn(),
    startUpgrade: vi.fn(),
    confirmUpgrade: vi.fn(),
    upgradeModalOpen: false,
    closeUpgradeModal: vi.fn(),
    upgradePreview: null,
    upgradeLoading: false,
    upgradeTargetPlan: null,
    contactQrOpen: false,
    closeContactQr: vi.fn(),
  }),
}));
vi.mock("@/features/membership/hooks/useServiceCatalog", () => ({
  useServiceCatalog: () => ({ services: [], loading: false, error: null, reload: vi.fn() }),
}));

import MembershipPage from "@/features/membership/pages/MembershipPage";

const cardCodes = (): (string | null)[] =>
  within(screen.getByTestId("plan-list")).getAllByTestId("plan-card").map((c) => c.getAttribute("data-plan-code"));

describe("MembershipPage 定价区（周期 Tab × 三档卡）", () => {
  it("顶部是 月付 / 季付 / 年付 三个周期 Tab（外加增值服务），顺序按周期升序", () => {
    render(<MembershipPage />);
    expect(screen.getAllByTestId("period-tab").map((b) => b.getAttribute("data-billing-days"))).toEqual(["30", "90", "365"]);
    expect(screen.getAllByTestId("period-tab").map((b) => b.textContent)).toEqual([
      "periodMonthly", "periodQuarterly", "periodYearly",
    ]);
    expect(screen.getByTestId("services-tab")).toBeInTheDocument();
  });

  it("默认月付 Tab：三张卡 = 个人版 / 企业版 / 人工对接，价格各自独立", () => {
    render(<MembershipPage />);
    expect(cardCodes()).toEqual(["personal_m", "business_m", "concierge_m"]);
    expect(screen.getByText("¥239")).toBeInTheDocument();
    expect(screen.getByText("¥780")).toBeInTheDocument();
    expect(screen.getByText("¥2,400")).toBeInTheDocument();
    expect(screen.getAllByText("/membershipMonth")).toHaveLength(3);
  });

  it("切到年付 Tab：卡换成年付行，价格变 ¥1,299 / ¥4,800 / ¥16,800，只有企业年付带推荐角标", () => {
    render(<MembershipPage />);
    fireEvent.click(screen.getAllByTestId("period-tab")[2]);
    expect(cardCodes()).toEqual(["personal_y", "business_y", "concierge_y"]);
    expect(screen.getByText("¥1,299")).toBeInTheDocument();
    expect(screen.getByText("¥4,800")).toBeInTheDocument();
    expect(screen.getByText("¥16,800")).toBeInTheDocument();
    expect(screen.getAllByText("membershipRecommended")).toHaveLength(1);
    expect(screen.getAllByText("/membershipYear")).toHaveLength(3);
  });

  it("切到季度 Tab：三张卡换成季付行", () => {
    render(<MembershipPage />);
    fireEvent.click(screen.getAllByTestId("period-tab")[1]);
    expect(cardCodes()).toEqual(["personal_q", "business_q", "concierge_q"]);
    expect(screen.getByText("¥1,680")).toBeInTheDocument();
  });

  it("全部权益平铺：三张卡都展示全部权益行（✓ 与 ✗ 并存，不折叠不隐藏）", () => {
    render(<MembershipPage />);
    // 标书文件下载：个人/企业 ✓、人工 ✗ —— 三张卡都应渲染该行
    expect(screen.getAllByText("标书文件下载")).toHaveLength(3);
    // 企业能力画像：个人 ✗、企业/人工 ✓ —— 同样三张卡都渲染
    expect(screen.getAllByText("企业能力画像")).toHaveLength(3);
  });

  it("不渲染「即将上线」角标（2026-10-29 产品口径：照常展示权益，功能后续完善）", () => {
    render(<MembershipPage />);
    expect(screen.queryByText("planBenefitsComingSoon")).toBeNull();
    expect(screen.queryByText(/即将上线/)).toBeNull();
  });

  it("增值服务是独立 Tab：切过去后套餐卡消失，切回月付恢复", () => {
    render(<MembershipPage />);
    fireEvent.click(screen.getByTestId("services-tab"));
    expect(screen.queryByTestId("plan-list")).toBeNull();
    expect(screen.getByText("servicesEmpty")).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("period-tab")[0]);
    expect(screen.getByTestId("plan-list")).toBeInTheDocument();
  });
});
