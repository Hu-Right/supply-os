import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: "zh" }),
}));

vi.mock("@/core/auth", () => ({
  useOptionalAuth: () => ({ authUser: { id: 1 }, isVip: true }),
}));

vi.mock("@/shared/data/countryNames", () => ({
  getCountryDisplayName: () => "法国",
}));

vi.mock("@/features/procurement/api", () => ({
  downloadNoticeReport: vi.fn().mockResolvedValue(undefined),
}));

import { NoticeUnlockedDetails } from "@/features/procurement/components/NoticeUnlockedDetails";
import type { NoticeItem } from "@/features/procurement/types";

const baseNotice = {
  noticePk: 1,
  buyerName: "EAU DE PARIS",
  countryCode: "FR",
  publishedTs: 1761350400,
  sourceUrl: "https://example.com/notice",
  // 联系人姓名为空（数据实况）：邮箱应兜底成主行，不能再出现 "-"
  contacts: [
    { name: "", email: "sach-edp@eaudeparis.fr", phone: "", role: "采购" },
    { name: "", email: "greffe.ta-paris@juradm.fr", phone: "" },
    { name: "", email: "sach-edp@eaudeparis.fr", phone: "" }, // 重复邮箱 → 去重
  ],
  // 原始附件/外链：本区块不再重复列出，只给「原始文件 Tab」跳转
  attachments: [
    { name: "1894051", url: "https://example.com/a1" },
    { name: "Profil acheteur", url: "https://example.com/a2" },
  ],
  externalLinks: [{ name: "Avis BOAMP", url: "https://example.com/a3" }],
  reportAvailable: false,
  reportUrl: "",
} as unknown as NoticeItem;

describe("NoticeUnlockedDetails（已解锁 · 采购方与联系信息）", () => {
  it("联系人姓名缺失时用邮箱兜底，不渲染 '-' 主行，且按邮箱去重", () => {
    render(<NoticeUnlockedDetails notice={baseNotice} />);
    expect(screen.getByText("sach-edp@eaudeparis.fr")).toBeInTheDocument();
    expect(screen.getByText("greffe.ta-paris@juradm.fr")).toBeInTheDocument();
    // 三个联系人里两个是同一邮箱 → 去重后 2 条
    expect(screen.getAllByText(/eaudeparis\.fr/)).toHaveLength(1);
    expect(screen.getAllByText(/juradm\.fr/)).toHaveLength(1);
    expect(screen.queryByText("-")).toBeNull();
  });

  it("原始附件不再平铺重复：只给一条「原始文件」Tab 跳转（含数量），点击切 Tab", () => {
    const onViewFiles = vi.fn();
    render(<NoticeUnlockedDetails notice={baseNotice} onViewFiles={onViewFiles} />);
    expect(screen.queryByText("1894051")).toBeNull();
    expect(screen.queryByText("Profil acheteur")).toBeNull();
    expect(screen.queryByText("Avis BOAMP")).toBeNull();
    const link = screen.getByText(/procurement_originalFilesLink/);
    expect(link.textContent).toContain('"count":3');
    fireEvent.click(link);
    expect(onViewFiles).toHaveBeenCalledTimes(1);
  });

  it("无报告时展示「暂无报告 + 人工服务包」引导横幅（不再用 VIP 旧说法）", () => {
    render(<NoticeUnlockedDetails notice={baseNotice} />);
    expect(screen.getByText("procurement_reportUnavailable")).toBeInTheDocument();
    expect(screen.getByText("procurement_reportGuideVip")).toBeInTheDocument();
    expect(screen.queryByText("VIP")).toBeNull();
  });

  it("有报告时展示下载项，且不再出现「整理中」重复文案", () => {
    const notice = {
      ...baseNotice,
      reportAvailable: true,
      reportUrl: "/api/notices/1/report",
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);
    expect(screen.getByText("procurement_reportFileLabel")).toBeInTheDocument();
    expect(screen.queryByText("procurement_reportPending")).toBeNull();
    expect(screen.queryByText("procurement_reportUnavailable")).toBeNull();
  });
});
