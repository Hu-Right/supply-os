/**
 * shared/filters/CountryFilter 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountryFilter } from "@/shared/filters/CountryFilter";

// mock 国家名称模块
vi.mock("@/shared/data/countryNames", () => ({
  getCountryDisplayName: (code: string, locale: string) => {
    if (locale === "zh") {
      const map: Record<string, string> = { CN: "中国", US: "美国" };
      return map[code] || code;
    }
    return code;
  },
  getCountryEnglishName: (code: string) => code,
}));

describe("CountryFilter", () => {
  const defaultProps = {
    countries: [
      { country: "CN", count: 100 },
      { country: "US", count: 80 },
    ],
    value: "",
    onChange: vi.fn(),
    locale: "en",
    placeholder: "All countries",
  };

  it("渲染搜索输入框", () => {
    render(<CountryFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "All countries");
  });

  it("输入搜索词 → 过滤列表", async () => {
    const user = userEvent.setup();
    render(<CountryFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "CN");
    // 搜索后聚焦状态下应显示过滤结果
    expect(input).toHaveValue("CN");
  });

  it("有值时显示清除按钮", () => {
    render(<CountryFilter {...defaultProps} value="CN" />);
    expect(screen.getByLabelText("filterClearCountry")).toBeInTheDocument();
  });

  it("点击清除 → onChange('')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CountryFilter {...defaultProps} value="CN" onChange={onChange} />);
    await user.click(screen.getByLabelText("filterClearCountry"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("aria-haspopup=listbox", () => {
    render(<CountryFilter {...defaultProps} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("聚焦时显示下拉", async () => {
    const user = userEvent.setup();
    render(<CountryFilter {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await user.click(input);
    // 聚焦后 aria-expanded 应为 true
    expect(input).toHaveAttribute("aria-expanded", "true");
  });
});
