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
});
