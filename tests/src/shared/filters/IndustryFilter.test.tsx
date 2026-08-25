/**
 * shared/filters/IndustryFilter 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndustryFilter } from "@/shared/filters/IndustryFilter";

describe("IndustryFilter", () => {
  const defaultProps = {
    industries: ["Technology", "Healthcare", "Finance"],
    selectedIndustry: "",
    onIndustryChange: vi.fn(),
  };

  it("渲染所有行业选项", () => {
    render(<IndustryFilter {...defaultProps} />);
    expect(screen.getByText("Technology")).toBeInTheDocument();
    expect(screen.getByText("Healthcare")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("显示全部行业默认选项", () => {
    render(<IndustryFilter {...defaultProps} />);
    expect(screen.getByText("allIndustries")).toBeInTheDocument();
  });

  it("选择行业 → onIndustryChange", async () => {
    const user = userEvent.setup();
    const onIndustryChange = vi.fn();
    render(<IndustryFilter {...defaultProps} onIndustryChange={onIndustryChange} />);
    await user.selectOptions(screen.getByRole("combobox"), "Technology");
    expect(onIndustryChange).toHaveBeenCalledWith("Technology");
  });

  it("有 aria-label", () => {
    render(<IndustryFilter {...defaultProps} />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-label", "filterSelectIndustry");
  });

  it("支持自定义 className", () => {
    render(<IndustryFilter {...defaultProps} className="custom" />);
    const select = screen.getByRole("combobox");
    expect(select.className).toContain("custom");
  });
});
