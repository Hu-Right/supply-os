import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { BuyerContactsTab } from "@/features/procurement/components/NoticeDetail/BuyerContactsTab";
import type { NoticeItem } from "@/features/procurement/types";

const baseNotice = {
  noticePk: 1,
  buyerName: "EAU DE PARIS",
  countryCode: "FR",
  publishedTs: 1761350400,
  sourceUrl: "https://example.com/notice",
  contacts: [
    { name: "", email: "sach-edp@eaudeparis.fr", phone: "", role: "采购" },
    { name: "", email: "greffe.ta-paris@juradm.fr", phone: "" },
    { name: "", email: "sach-edp@eaudeparis.fr", phone: "" }, // 重复邮箱 → 去重
    { name: "Jean Dupont", email: "jean@example.com", phone: "+33 1 23 45 67 89" },
  ],
} as unknown as NoticeItem;

describe("BuyerContactsTab（联系人 Tab）", () => {
  it("未解锁：展示会员专属引导，不泄露联系人", () => {
    render(<BuyerContactsTab notice={baseNotice} coreUnlocked={false} />);
    expect(screen.getByText(/detail_tabBuyer/)).toBeInTheDocument();
    expect(screen.getByText("detail_buyerLockedIntro")).toBeInTheDocument();
    expect(screen.queryByText("sach-edp@eaudeparis.fr")).toBeNull();
  });

  it("已解锁：联系人列表（邮箱兜底、去重），不再重复采购方信息", () => {
    render(<BuyerContactsTab notice={baseNotice} coreUnlocked />);
    // 采购方信息已由头部信息表/公开详情页承担，本 Tab 不再重复
    expect(screen.queryByText("EAU DE PARIS")).toBeNull();
    expect(screen.queryByText("procurement_agencyFullName")).toBeNull();
    // 两个同邮箱联系人去重后只出现一次
    expect(screen.getAllByText(/sach-edp@eaudeparis\.fr/)).toHaveLength(1);
    expect(screen.getAllByText(/greffe\.ta-paris@juradm\.fr/)).toHaveLength(1);
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
    // 绝不出现「👤 -」占位
    expect(screen.queryByText("-")).toBeNull();
  });

  it("没有联系人时展示兜底文案", () => {
    const notice = { ...baseNotice, contacts: [] } as unknown as NoticeItem;
    render(<BuyerContactsTab notice={notice} coreUnlocked />);
    expect(screen.getByText("procurement_noContacts")).toBeInTheDocument();
  });
});
