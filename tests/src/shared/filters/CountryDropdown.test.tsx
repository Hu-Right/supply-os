/**
 * shared/filters/CountryDropdown 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountryDropdown } from "@/shared/filters/CountryDropdown";

// mock 国家名称模块
vi.mock("@/shared/data/countryNames", () => ({
  getCountryDisplayName: (code: string, _locale: string) => code,
  getCountryEnglishName: (code: string) => code,
}));

describe("CountryDropdown", () => {
  const defaultProps = {
    visible: [
      { country: "CN", count: 100 },
      { country: "US", count: 80 },
    ],
    placeholder: "All countries",
    value: "",
    locale: "en",
    onSelect: vi.fn(),
    hasMore: false,
    filteredCount: 2,
    maxVisible: 200,
    noResultsText: "No results",
    moreResultsText: "more results",
  };

  it("渲染占位选项", () => {
    render(<CountryDropdown {...defaultProps} />);
    expect(screen.getByText("All countries")).toBeInTheDocument();
  });

  it("渲染国家列表", () => {
    render(<CountryDropdown {...defaultProps} />);
    expect(screen.getByText("CN")).toBeInTheDocument();
    expect(screen.getByText("US")).toBeInTheDocument();
  });

  it("显示 count 数字", () => {
    render(<CountryDropdown {...defaultProps} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("点击国家 → onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CountryDropdown {...defaultProps} onSelect={onSelect} />);
    await user.click(screen.getByText("CN"));
    expect(onSelect).toHaveBeenCalledWith("CN");
  });

  it("点击占位 → onSelect('')", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CountryDropdown {...defaultProps} onSelect={onSelect} />);
    await user.click(screen.getByText("All countries"));
    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("hasMore → 显示更多结果文本", () => {
    render(<CountryDropdown {...defaultProps} hasMore filteredCount={300} maxVisible={200} />);
    expect(screen.getByText(/100 more results/)).toBeInTheDocument();
  });

  it("visible 为空 → 显示无结果文本", () => {
    render(<CountryDropdown {...defaultProps} visible={[]} />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("选中项高亮", () => {
    render(<CountryDropdown {...defaultProps} value="CN" />);
    const options = screen.getAllByRole("option");
    // CN option should have aria-selected=true
    const cnOption = options.find((o) => o.getAttribute("aria-selected") === "true");
    expect(cnOption).toBeTruthy();
  });
});
