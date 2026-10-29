import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/shared/data/countryNames", () => ({
  getCountryDisplayName: () => "法国",
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

describe("BuyerContactsTab（采购方与联系人）", () => {
  it("未解锁：展示会员专属引导，不泄露联系人", () => {
    render(<BuyerContactsTab notice={baseNotice} coreUnlocked={false} />);
    expect(screen.getByText(/detail_tabBuyer/)).toBeInTheDocument();
    expect(screen.getByText("detail_buyerLockedIntro")).toBeInTheDocument();
    expect(screen.queryByText("sach-edp@eaudeparis.fr")).toBeNull();
  });

  it("已解锁：机构信息 + 原始链接 + 联系人（邮箱兜底、去重）", () => {
    render(<BuyerContactsTab notice={baseNotice} coreUnlocked />);
    expect(screen.getByText("EAU DE PARIS")).toBeInTheDocument();
    expect(screen.getByText("法国")).toBeInTheDocument();
    const link = screen.getByText("procurement_openNotice");
    expect(link.closest("a")).toHaveAttribute("href", "https://example.com/notice");

    // 两个同名/同邮箱联系人去重后只出现一次；条目数为 3（2 个邮箱兜底 + 1 个具名）
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
