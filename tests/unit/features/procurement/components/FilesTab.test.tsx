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
import type { GateState } from "@/types";
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

/** 企业/人工档：拥有投标可行性报告权益 */
const enterpriseGates: Record<string, GateState> = { bid_feasibility_report: "included" };
/** 个人/免费档：无报告权益 */
const personalGates: Record<string, GateState> = { bid_feasibility_report: "upgrade" };

describe("FilesTab（投标材料 = 报告 + 原始文件）", () => {
  it("企业档：报告区 + 原始附件 + 外部链接都在同一个 Tab", () => {
    render(<FilesTab notice={baseNotice} coreUnlocked isVip gates={enterpriseGates} />);
    expect(screen.getByText("detail_tabMaterials")).toBeInTheDocument();
    expect(screen.getByText("procurement_breakdownModuleTitle")).toBeInTheDocument();
    expect(screen.getByText("Tender_Document.pdf")).toBeInTheDocument();
    expect(screen.getByText("1894051")).toBeInTheDocument();
    expect(screen.getByText("Avis BOAMP")).toBeInTheDocument();
    expect(screen.queryByText("procurement_noFiles")).toBeNull();
  });

  it("企业档无报告：报告区展示「暂无报告 + 人工服务包」引导", () => {
    render(<FilesTab notice={baseNotice} coreUnlocked isVip gates={enterpriseGates} />);
    expect(screen.getByText("procurement_reportUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("procurement_reportFileLabel")).toBeNull();
  });

  it("企业档有报告：报告区展示下载按钮", () => {
    const notice = {
      ...baseNotice,
      reportAvailable: true,
      reportUrl: "/api/notices/1/report",
    } as unknown as NoticeDetailItem;
    render(<FilesTab notice={notice} coreUnlocked isVip gates={enterpriseGates} />);
    expect(screen.getByText("procurement_reportFileLabel")).toBeInTheDocument();
    expect(screen.queryByText("procurement_reportUnavailable")).toBeNull();
  });

  it("个人档：报告区展示「企业版权益」升级引导，不展示下载/预览", () => {
    const notice = {
      ...baseNotice,
      reportAvailable: true,
      reportUrl: "/api/notices/1/report",
    } as unknown as NoticeDetailItem;
    render(<FilesTab notice={notice} coreUnlocked isVip gates={personalGates} />);
    expect(screen.getByText("detail_reportEnterpriseOnly")).toBeInTheDocument();
    expect(screen.getByText("detail_reportEnterpriseCta")).toBeInTheDocument();
    expect(screen.queryByText("procurement_reportFileLabel")).toBeNull();
    expect(screen.queryByText("procurement_reportUnavailable")).toBeNull();
    // 原始文件仍可用（个人档核心价值）
    expect(screen.getByText("Tender_Document.pdf")).toBeInTheDocument();
  });

  it("未解锁：展示会员专属引导，不泄露附件名", () => {
    render(<FilesTab notice={baseNotice} coreUnlocked={false} isVip gates={enterpriseGates} />);
    expect(screen.getByText("detail_filesLockedIntro")).toBeInTheDocument();
    expect(screen.getByText("detail_filesVipHint")).toBeInTheDocument();
    expect(screen.queryByText("Tender_Document.pdf")).toBeNull();
  });

  it("已解锁但无文件：展示空态", () => {
    const notice = { ...baseNotice, attachments: [], externalLinks: [] } as unknown as NoticeDetailItem;
    render(<FilesTab notice={notice} coreUnlocked isVip gates={enterpriseGates} />);
    expect(screen.getByText("procurement_noFiles")).toBeInTheDocument();
  });
});
