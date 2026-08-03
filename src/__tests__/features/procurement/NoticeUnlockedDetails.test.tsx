import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoticeUnlockedDetails } from "@/features/procurement/components/NoticeUnlockedDetails";
import type { NoticeItem } from "@/features/procurement/types";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

describe("NoticeUnlockedDetails", () => {
  it("returns null when no unlocked content", () => {
    const { container } = render(
      <NoticeUnlockedDetails notice={{ id: 1, title: "t" } as NoticeItem} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders buyer info, contacts and attachments", () => {
    const notice = {
      id: 1,
      title: "t",
      agency_full: "United Nations Development Programme (UNDP)",
      contacts: [{ name: "Jane Doe", role: "Buyer", email: "jane@un.org", phone: "123" }],
      documents: [{ name: "RFP.pdf", url: "https://example.com/rfp.pdf" }],
      external_links: ["https://example.com/portal"],
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_unlockedDetailsTitle")).toBeInTheDocument();
    expect(screen.getByText("procurement_buyerInfo")).toBeInTheDocument();
    expect(
      screen.getByText("United Nations Development Programme (UNDP)")
    ).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText("jane@un.org")).toHaveAttribute("href", "mailto:jane@un.org");
    expect(screen.getByText(/RFP.pdf/)).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("https://example.com/rfp.pdf");
    expect(hrefs).toContain("https://example.com/portal");
  });

  it("falls back from agency_full to agency and organization", () => {
    const notice = {
      id: 1,
      title: "t",
      organization: "UNICEF Supply Division",
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);
    expect(screen.getByText("UNICEF Supply Division")).toBeInTheDocument();
  });

  // ── 采购方/机构信息卡：四行 label + 缺失值 "-" 兜底 ──
  it("renders the agency info card with four rows and dash fallbacks", () => {
    const notice = {
      id: 1,
      title: "t",
      agency_full: "NHS CHESHIRE AND MERSEYSIDE INTEGRATED CARE BOARD",
      country: "United Kingdom",
      published_date: "2026-07-28T16:20:19+01:00",
      url: "https://notices.example.com/abc",
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_agencyFullName：")).toBeInTheDocument();
    expect(screen.getByText("procurement_country：")).toBeInTheDocument();
    expect(screen.getByText("procurement_publishedDate：")).toBeInTheDocument();
    expect(screen.getByText("procurement_originalLink：")).toBeInTheDocument();
    expect(screen.getByText(/United Kingdom/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-28T16:20:19\+01:00/)).toBeInTheDocument();

    // 缺失国家/发布日期时以 "-" 兜底（原版口径）
    const { container } = render(
      <NoticeUnlockedDetails
        notice={{ id: 2, title: "t", agency: "UNDP" } as unknown as NoticeItem} />
    );
    expect(container.textContent).toContain("-");
  });

  // ── 采购文件/拆解材料模块：文件+外链合并列表、去重、空态 ──
  it("renders the breakdown materials module with deduped files and external links", () => {
    const notice = {
      id: 1,
      title: "t",
      documents: [{ name: "RFP.pdf", url: "https://example.com/rfp.pdf" }],
      procurement_files: [
        // 与 documents 完全重复，应被 url|name 去重只渲染一次
        { name: "RFP.pdf", url: "https://example.com/rfp.pdf" },
        { name: "BoQ.xlsx", url: "https://example.com/boq.xlsx" },
      ],
      external_links: [{ name: "Portal", url: "https://example.com/portal" }],
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_breakdownModuleTitle")).toBeInTheDocument();
    expect(screen.getAllByText(/RFP.pdf/)).toHaveLength(1);
    expect(screen.getByText(/BoQ.xlsx/)).toBeInTheDocument();
    expect(screen.getByText(/Portal/)).toBeInTheDocument();
    // 有附件时展示原始招标附件小标题
    expect(screen.getByText("procurement_originalAttachments")).toBeInTheDocument();
  });

  it("shows the empty-state hint when no files are available", () => {
    const notice = {
      id: 1,
      title: "t",
      agency: "UNDP",
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_breakdownModuleTitle")).toBeInTheDocument();
    // 无报告且无附件时展示报告整理中降级提示（取代原 procurement_noFiles 空态）
    expect(screen.getByText("procurement_reportPending")).toBeInTheDocument();
  });

  it("renders attachment name without link when url missing", () => {
    const notice: NoticeItem = {
      id: 1,
      title: "t",
      documents: [{ name: "NoLinkDoc" }],
    };
    render(<NoticeUnlockedDetails notice={notice} />);
    expect(screen.getByText(/NoLinkDoc/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // ── P1-C: bid breakdown suggestions card ──
  it("renders the bid breakdown card and limits category codes to the first 4", () => {
    const notice = {
      id: 1,
      title: "t",
      // hasContent 门控：无任何机构/文件/联系人/链接内容时组件整体返回 null
      url: "https://example.com/notice",
      difficulty: "High",
      registration_level: "Level 3",
      estimated_value: "$1M",
      deadline: "2026-12-31",
      unspsc_codes: [
        { code: "A1" },
        { code: "A2" },
        { code: "A3" },
        { code: "A4" },
        { code: "A5" },
      ],
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_bidBreakdownTitle")).toBeInTheDocument();
    expect(screen.getByText("procurement_bidNextStep")).toBeInTheDocument();
    // Only the first 4 codes are shown, A5 is dropped
    expect(screen.getByText(/A1, A2, A3, A4/)).toBeInTheDocument();
    expect(screen.queryByText(/A5/)).toBeNull();
  });

  it("falls back to placeholder wording when bid fields are missing", () => {
    const notice = {
      id: 1,
      title: "t",
      // no difficulty / registration_level / estimated_value / unspsc_codes
      documents: [{ name: "Doc", url: "https://example.com/doc" }],
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText(/procurement_bidPendingEval/)).toBeInTheDocument();
    expect(screen.getByText(/procurement_bidPendingConfirm/)).toBeInTheDocument();
    expect(screen.getByText(/procurement_bidUndisclosed/)).toBeInTheDocument();
    expect(screen.getByText(/procurement_bidPendingSupplement/)).toBeInTheDocument();
  });

  // ── P1-D: original notice link + key_contacts compatibility ──
  it("renders the original notice link when notice.url is present", () => {
    const notice = {
      id: 1,
      title: "t",
      url: "https://notices.example.com/abc",
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_originalLink：")).toBeInTheDocument();
    const link = screen.getByText("procurement_openNotice").closest("a");
    expect(link).toHaveAttribute("href", "https://notices.example.com/abc");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders key_contacts as a text paragraph when it is a string", () => {
    const notice = {
      id: 1,
      title: "t",
      key_contacts: "Jane Doe, procurement@un.org, +1 555 0100",
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_keyContacts")).toBeInTheDocument();
    expect(
      screen.getByText("Jane Doe, procurement@un.org, +1 555 0100")
    ).toBeInTheDocument();
  });

  it("renders key_contacts as contact cards when it is an object array", () => {
    const notice = {
      id: 1,
      title: "t",
      key_contacts: [{ name: "John Smith", email: "john@un.org", role: "Officer" }],
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText(/John Smith/)).toBeInTheDocument();
    expect(screen.getByText("john@un.org")).toHaveAttribute("href", "mailto:john@un.org");
  });
});
