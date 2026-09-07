import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { NoticeQuickView } from "@/features/procurement/components/NoticeQuickView";
import type { NoticeDetailItem } from "@/features/procurement/types";

const mockNotice = {
  id: 1,
  title: "Test Notice",
  reference: "KEN/UNOPS/2025/0172",
  notice_type: "ITB",
  country: "KE",
  deadline: "2025-06-15 17:00",
  estimated_value: "1200000",
} as NoticeDetailItem;

describe("NoticeQuickView", () => {
  it("渲染标题", () => {
    render(<NoticeQuickView notice={mockNotice} />);
    expect(screen.getByText("detail_quickViewTitle")).toBeInTheDocument();
  });

  it("显示项目编号", () => {
    render(<NoticeQuickView notice={mockNotice} />);
    expect(screen.getByText("KEN/UNOPS/2025/0172")).toBeInTheDocument();
  });

  it("显示招标方式 i18n key", () => {
    render(<NoticeQuickView notice={mockNotice} />);
    expect(screen.getByText("detail_openTendering")).toBeInTheDocument();
  });

  it("显示货币 USD", () => {
    render(<NoticeQuickView notice={mockNotice} />);
    expect(screen.getByText("USD")).toBeInTheDocument();
  });

  it("扩展字段追加保函/联合体行", () => {
    render(
      <NoticeQuickView
        notice={mockNotice}
        extra={{ needs_guarantee: true, accepts_consortium: false }}
      />,
    );
    expect(screen.getByText("detail_yes")).toBeInTheDocument();
    expect(screen.getAllByText("detail_no")).toHaveLength(1);
  });

  it("无数据时显示占位符 -", () => {
    render(<NoticeQuickView notice={{ id: 2, title: "Empty" } as NoticeDetailItem} />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThan(0);
  });
});
