/**
 * shared/filters/AgencyFilter 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

  it("选择后再次聚焦 → 输入框显示翻译名", async () => {
    const user = userEvent.setup();
    // 使用受控包装组件，确保 value 随 onChange 更新
    function TestWrapper() {
      const [val, setVal] = useState("");
      return <AgencyFilter {...defaultProps} value={val} onChange={setVal} />;
    }
    render(<TestWrapper />);
    const input = screen.getByRole("textbox");
    // 打开下拉并选择
    await user.click(input);
    await user.click(screen.getByText("联合国儿童基金会"));
    // 再次聚焦输入框
    await user.click(input);
    // 聚焦后应显示翻译名
    expect(input).toHaveValue("联合国儿童基金会");
  });

  it("下拉中选择 '全部' → onChange('')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AgencyFilter {...defaultProps} value="UNDP" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.click(input); // 打开下拉
    // 点击"全部"选项
    const allOption = screen.getByText("All agencies");
    await user.click(allOption);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("下拉中选择具体机构 → onChange(agency)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AgencyFilter {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.click(input); // 打开下拉
    await user.click(screen.getByText("UNDP"));
    expect(onChange).toHaveBeenCalledWith("UNDP");
  });

  it("搜索无匹配 → 显示 noResultsText", async () => {
    const user = userEvent.setup();
    render(<AgencyFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "不存在的机构");
    // 应显示默认的无匹配提示
    expect(screen.getByText("filterNoMatchAgencies")).toBeInTheDocument();
  });

  it("自定义 noResultsText", async () => {
    const user = userEvent.setup();
    render(<AgencyFilter {...defaultProps} noResultsText="没有找到" />);
    const input = screen.getByRole("textbox");
    await user.type(input, "xyz");
    expect(screen.getByText("没有找到")).toBeInTheDocument();
  });
});
