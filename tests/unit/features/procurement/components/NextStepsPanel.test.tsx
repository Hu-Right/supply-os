import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import { NextStepsPanel } from "@/features/procurement/components/NextStepsPanel";
import type { NoticeItem } from "@/features/procurement/types";

const mockNotice = { id: 1, title: "Test Notice" } as NoticeItem;

describe("NextStepsPanel", () => {
  it("渲染标题", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn isVip={false} />);
    expect(screen.getByText("detail_nextStepsTitle")).toBeInTheDocument();
  });

  it("显示 4 个步骤", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn isVip={false} />);
    expect(screen.getByText("detail_stepUpload")).toBeInTheDocument();
    expect(screen.getByText("detail_stepUnlock")).toBeInTheDocument();
    expect(screen.getByText("detail_stepConsultant")).toBeInTheDocument();
    expect(screen.getByText("detail_stepCrm")).toBeInTheDocument();
  });

  it("显示权益层级标签", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn isVip={false} />);
    expect(screen.getAllByText("detail_tierFree")).toHaveLength(2);
    expect(screen.getByText("detail_tierMember")).toBeInTheDocument();
    expect(screen.getByText("detail_tierPro")).toBeInTheDocument();
  });

  it("非 VIP 用户显示升级按钮", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn isVip={false} />);
    expect(screen.getByText("detail_upgradeUnlock")).toBeInTheDocument();
  });

  it("VIP 用户不显示升级按钮", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn isVip />);
    expect(screen.queryByText("detail_upgradeUnlock")).not.toBeInTheDocument();
  });

  it("步骤按钮可点击", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn isVip={false} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });
});
