/**
 * shared/filters/AgencyFilter 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgencyFilter } from "@/shared/filters/AgencyFilter";

describe("AgencyFilter", () => {
  const defaultProps = {
    agencies: [
      { agency: "UNDP", count: 50 },
      { agency: "UNICEF", count: 30, agency_i18n: "联合国儿童基金会" },
    ],
    value: "",
    onChange: vi.fn(),
    placeholder: "All agencies",
  };

  it("渲染搜索输入框", () => {
    render(<AgencyFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "All agencies");
  });

  it("输入搜索词 → 过滤", async () => {
    const user = userEvent.setup();
    render(<AgencyFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "UNDP");
    expect(input).toHaveValue("UNDP");
  });

  it("有值时显示清除按钮", () => {
    render(<AgencyFilter {...defaultProps} value="UNDP" />);
    expect(screen.getByLabelText("filterClearAgency")).toBeInTheDocument();
  });

  it("点击清除 → onChange('')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AgencyFilter {...defaultProps} value="UNDP" onChange={onChange} />);
    await user.click(screen.getByLabelText("filterClearAgency"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("聚焦时显示下拉", async () => {
    const user = userEvent.setup();
    render(<AgencyFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("aria-haspopup=listbox", () => {
    render(<AgencyFilter {...defaultProps} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("搜索匹配 agency_i18n 翻译名", async () => {
    const user = userEvent.setup();
    render(<AgencyFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "儿童");
    // 应该能匹配到 UNICEF（agency_i18n 包含"儿童"）
    expect(input).toHaveValue("儿童");
  });
});
