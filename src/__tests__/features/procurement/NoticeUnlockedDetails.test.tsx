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

  it("renders meta rows, contacts and attachments", () => {
    const notice = {
      id: 1,
      title: "t",
      published_date: "2026-07-01",
      difficulty: "Medium",
      registration_level: "Level 2",
      contacts: [{ name: "Jane Doe", role: "Buyer", email: "jane@un.org", phone: "123" }],
      documents: [{ name: "RFP.pdf", url: "https://example.com/rfp.pdf" }],
      external_links: ["https://example.com/portal"],
    } as unknown as NoticeItem;
    render(<NoticeUnlockedDetails notice={notice} />);

    expect(screen.getByText("procurement_unlockedDetailsTitle")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText("jane@un.org")).toHaveAttribute("href", "mailto:jane@un.org");
    expect(screen.getByText(/RFP.pdf/)).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("https://example.com/rfp.pdf");
    expect(hrefs).toContain("https://example.com/portal");
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

    expect(screen.getByText("procurement_originalLink")).toBeInTheDocument();
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
