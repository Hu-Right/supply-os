import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ServicesPage from "@/features/services/pages/ServicesPage";

// Mock useLocale
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

describe("ServicesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all service cards from SERVICES data", () => {
    render(<ServicesPage />);
    // SERVICES has 6 items
    expect(screen.getByText("国际公共采购 资质代办 & 代注册托管")).toBeInTheDocument();
    expect(screen.getByText("海外保税区'前展后仓'备件物流")).toBeInTheDocument();
    expect(screen.getByText("金牌出海企业深度合规培训")).toBeInTheDocument();
  });

  it("displays service title and description", () => {
    render(<ServicesPage />);
    expect(
      screen.getByText("国际公共采购 资质代办 & 代注册托管")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/帮助中方精密智造/)
    ).toBeInTheDocument();
  });

  it("renders service specs/tags", () => {
    render(<ServicesPage />);
    expect(screen.getByText("英文财务报表制作")).toBeInTheDocument();
    expect(screen.getByText("UNSPSC精确对准码")).toBeInTheDocument();
    expect(screen.getByText("1对1合规排雷")).toBeInTheDocument();
  });

  it("dispatches supply-os:consult event when clicking book button", () => {
    const dispatchSpy = vi.fn();
    window.dispatchEvent = dispatchSpy;

    render(<ServicesPage />);
    const bookButtons = screen.getAllByText("bookServiceNow");
    fireEvent.click(bookButtons[0]);

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("supply-os:consult");
  });

  it("renders success stories section with correct count", () => {
    render(<ServicesPage />);
    // SUCCESS_STORIES has 3 items, title is t("successStory")
    expect(screen.getByText("successStory")).toBeInTheDocument();
    expect(screen.getByText("2026.04")).toBeInTheDocument();
    expect(screen.getByText("2026.03")).toBeInTheDocument();
    expect(screen.getByText("2026.01")).toBeInTheDocument();
  });

  it("displays story date and title", () => {
    render(<ServicesPage />);
    expect(
      screen.getByText("常州精密机床成功在法兰克福样品展厅接单三万套零件采购")
    ).toBeInTheDocument();
  });
});
