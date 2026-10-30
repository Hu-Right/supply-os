/**
 * cards 板块诚实化组件测试：确保只渲染真实/空态，无 curated 假数。
 * @module tests/unit/features/procurement/awards/cards
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoCardsGrid, BuyerProfileCard, TopWinnersCard, RecentAwardsCard } from "@/app/(public)/award-intelligence/sections/cards";

/** useLocale 桩：zh 字典按 {var} 插值，与站内组件测试同一模式（缺键回退键名） */
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    locale: "zh",
    t: (key: string, params?: Record<string, string | number>) => {
      let s: string = dict[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
  }),
}));

const dict: Record<string, string> = {
  awardDataConnecting: "数据接入中",
  awardInfoGridEmptyDesc: "真实中标数据到位后自动展示速览卡",
  awardCardLinkTrend: "查看趋势",
  awardCardLinkCategory: "查看品类",
  awardCardLinkWinners: "查看名单",
  awardCardLinkReminder: "设置提醒",
  awardBuyerProfileTitle: "采购机构画像",
  awardBuyerProfileEmptyTitle: "暂无机构画像",
  awardBuyerProfileDetailBtn: "查看机构详情",
  awardWinnersCardTitle: "主要中标商",
  awardWinnersCardSuffix: "（近期样本·按中标次数）",
  awardThRank: "排名",
  awardThSupplier: "供应商",
  awardThWinCount: "中标次数",
  awardWinnersCleansingNote: "中标商数据清洗进行中，名称以来源公示原文为准",
  awardWinnersMoreBtn: "查看更多中标商",
  awardWinnersEmptyTitle: "暂无中标商",
  awardRecentEmptyTitle: "暂无最新中标记录",
  awardRecentTitle: "最新中标记录",
  awardThProject: "项目",
  awardThBuyer: "采购方",
  awardThDate: "日期",
};

describe("cards 诚实化", () => {
  it("infoCards 为空时展示诚实空态，不含假数字", () => {
    const { container } = render(<InfoCardsGrid cards={[]} onAction={vi.fn()} />);
    expect(screen.getByText("数据接入中")).toBeTruthy();
    expect(container.textContent).not.toMatch(/22\.7B|12,?847|193|45 天/);
  });

  it("infoCards 有真实卡片时渲染真实值", () => {
    render(<InfoCardsGrid cards={[{ title: "数据来源", value: "ccgp", sub: "1,669 条记录", badge: "覆盖", link: "trend", linkLabelKey: "awardCardLinkTrend" }]} onAction={vi.fn()} />);
    expect(screen.getByText("数据来源")).toBeTruthy();
    expect(screen.getByText("ccgp")).toBeTruthy();
  });

  it("buyerProfile present=false 时空态；不出现 UNICEF 假画像", () => {
    render(<BuyerProfileCard section={{ present: false, reason: "买家画像需多来源积累" }} onOpenAgency={vi.fn()} />);
    expect(screen.getByText("买家画像需多来源积累")).toBeTruthy();
    expect(screen.queryByText(/UNICEF|联合国儿童基金会/)).toBeNull();
  });

  it("topWinners 渲染真实中标商名，不出现 Siemens", () => {
    render(<TopWinnersCard section={{ present: true, data: [{ rank: 1, name: "某某科技", country: "中国", count: 7, totalUsd: 0 }] }} onSelectSupplier={vi.fn()} onOpenWinners={vi.fn()} />);
    expect(screen.getByText("某某科技")).toBeTruthy();
    expect(screen.queryByText(/Siemens|McKesson/)).toBeNull();
  });

  it("recentAwards 空时诚实空态；有记录时渲染真实标题", () => {
    const { rerender } = render(<RecentAwardsCard rows={[]} />);
    expect(screen.getByText("暂无最新中标记录")).toBeTruthy();
    rerender(<RecentAwardsCard rows={[{ id: 1, title: "某项目中标公告", titleCn: "某项目中标公告", agency: "中国政府采购网", country: "中国", awardDate: "2026-10-09", contractValueUsd: null, currency: "CNY" }]} />);
    expect(screen.getByText("某项目中标公告")).toBeTruthy();
  });
});
