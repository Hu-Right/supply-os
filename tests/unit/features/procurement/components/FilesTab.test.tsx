import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/core/auth", () => ({
  useOptionalAuth: () => ({ authUser: { id: 1 }, isVip: true }),
}));

vi.mock("@/features/procurement/api", () => ({
  downloadNoticeReport: vi.fn().mockResolvedValue(undefined),
}));

import { FilesTab } from "@/features/procurement/components/NoticeDetail/FilesTab";
import type { NoticeDetailItem } from "@/features/procurement/types";

const baseNotice = {
  noticePk: 1,
  sourceUrl: "https://example.com/notice",
  attachments: [
    { name: "Tender_Document.pdf", url: "https://example.com/a1" },
    { name: "1894051", url: "https://example.com/a2" },
  ],
  externalLinks: [{ name: "Avis BOAMP", url: "https://example.com/a3" }],
  reportAvailable: false,
  reportUrl: "",
  breakdownFileCount: 2,
} as unknown as NoticeDetailItem;

describe("FilesTab（投标材料 = 报告 + 原始文件）", () => {
  it("已解锁：报告区 + 原始附件 + 外部链接都在同一个 Tab", () => {
    render(<FilesTab notice={baseNotice} coreUnlocked isVip />);
    expect(screen.getByText("detail_tabMaterials")).toBeInTheDocument();
    expect(screen.getByText("procurement_breakdownModuleTitle")).toBeInTheDocument();
    expect(screen.getByText("Tender_Document.pdf")).toBeInTheDocument();
    expect(screen.getByText("1894051")).toBeInTheDocument();
    expect(screen.getByText("Avis BOAMP")).toBeInTheDocument();
    expect(screen.queryByText("procurement_noFiles")).toBeNull();
  });

  it("无报告：报告区展示「暂无报告 + 人工服务包」引导（不再是独立的旧解锁卡）", () => {
    render(<FilesTab notice={baseNotice} coreUnlocked isVip />);
    expect(screen.getByText("procurement_reportUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("procurement_reportFileLabel")).toBeNull();
  });

  it("有报告：报告区展示下载按钮", () => {
    const notice = {
      ...baseNotice,
      reportAvailable: true,
      reportUrl: "/api/notices/1/report",
    } as unknown as NoticeDetailItem;
    render(<FilesTab notice={notice} coreUnlocked isVip />);
    expect(screen.getByText("procurement_reportFileLabel")).toBeInTheDocument();
    expect(screen.queryByText("procurement_reportUnavailable")).toBeNull();
  });

  it("未解锁：展示会员专属引导，不泄露附件名", () => {
    render(<FilesTab notice={baseNotice} coreUnlocked={false} isVip />);
    expect(screen.getByText("detail_filesLockedIntro")).toBeInTheDocument();
    expect(screen.getByText("detail_filesVipHint")).toBeInTheDocument();
    expect(screen.queryByText("Tender_Document.pdf")).toBeNull();
  });

  it("已解锁但无文件：展示空态", () => {
    const notice = { ...baseNotice, attachments: [], externalLinks: [] } as unknown as NoticeDetailItem;
    render(<FilesTab notice={notice} coreUnlocked isVip />);
    expect(screen.getByText("procurement_noFiles")).toBeInTheDocument();
  });
});
