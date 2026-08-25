/**
 * shared/filters/RegionFilter 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegionFilter } from "@/shared/filters/RegionFilter";

describe("RegionFilter", () => {
  const defaultProps = {
    regions: ["Africa", "Asia", "Europe"],
    selectedRegion: "",
    onRegionChange: vi.fn(),
  };

  it("渲染所有地区选项", () => {
    render(<RegionFilter {...defaultProps} />);
    expect(screen.getByText("Africa")).toBeInTheDocument();
    expect(screen.getByText("Asia")).toBeInTheDocument();
    expect(screen.getByText("Europe")).toBeInTheDocument();
  });

  it("显示默认全部选项", () => {
    render(<RegionFilter {...defaultProps} />);
    expect(screen.getByText("allRegions")).toBeInTheDocument();
  });

  it("选择地区 → onRegionChange", async () => {
    const user = userEvent.setup();
    const onRegionChange = vi.fn();
    render(<RegionFilter {...defaultProps} onRegionChange={onRegionChange} />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "Asia");
    expect(onRegionChange).toHaveBeenCalledWith("Asia");
  });

  it("有 countries 时显示国家下拉", () => {
    render(
      <RegionFilter
        {...defaultProps}
        countries={["China", "Japan"]}
        onCountryChange={vi.fn()}
      />,
    );
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    expect(screen.getByText("China")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
  });

  it("无 countries 时只显示地区下拉", () => {
    render(<RegionFilter {...defaultProps} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("选择国家 → onCountryChange", async () => {
    const user = userEvent.setup();
    const onCountryChange = vi.fn();
    render(
      <RegionFilter
        {...defaultProps}
        countries={["China", "Japan"]}
        onCountryChange={onCountryChange}
      />,
    );
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "Japan");
    expect(onCountryChange).toHaveBeenCalledWith("Japan");
  });

  it("有 aria-label", () => {
    render(<RegionFilter {...defaultProps} />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-label", "filterSelectRegion");
  });

  it("有 countries 但无 onCountryChange → 只显示地区下拉", () => {
    render(
      <RegionFilter
        {...defaultProps}
        countries={["China", "Japan"]}
        onCountryChange={undefined}
      />,
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("selectedCountry 有值时国家下拉正确选中", () => {
    render(
      <RegionFilter
        {...defaultProps}
        countries={["China", "Japan"]}
        onCountryChange={vi.fn()}
        selectedCountry="Japan"
      />,
    );
    const selects = screen.getAllByRole("combobox");
    expect(selects[1]).toHaveValue("Japan");
  });

  it("自定义 className 应用到容器", () => {
    const { container } = render(
      <RegionFilter {...defaultProps} className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
