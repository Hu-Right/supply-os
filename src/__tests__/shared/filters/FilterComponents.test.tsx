import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RegionFilter } from "@/shared/filters/RegionFilter";
import { IndustryFilter } from "@/shared/filters/IndustryFilter";

describe("RegionFilter", () => {
  const regions = ["亚洲", "欧洲", "非洲"];
  const countries = ["中国", "日本", "韩国"];
  const onRegionChange = vi.fn();
  const onCountryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders region options from regions prop", () => {
    render(
      <RegionFilter
        regions={regions}
        selectedRegion=""
        onRegionChange={onRegionChange}
      />
    );
    expect(screen.getByText("亚洲")).toBeInTheDocument();
    expect(screen.getByText("欧洲")).toBeInTheDocument();
    expect(screen.getByText("非洲")).toBeInTheDocument();
  });

  it("calls onRegionChange when selecting a region", () => {
    render(
      <RegionFilter
        regions={regions}
        selectedRegion=""
        onRegionChange={onRegionChange}
      />
    );
    const select = screen.getByLabelText("选择地区");
    fireEvent.change(select, { target: { value: "亚洲" } });
    expect(onRegionChange).toHaveBeenCalledWith("亚洲");
  });

  it("renders country filter when countries and onCountryChange are provided", () => {
    render(
      <RegionFilter
        regions={regions}
        selectedRegion="亚洲"
        onRegionChange={onRegionChange}
        countries={countries}
        selectedCountry=""
        onCountryChange={onCountryChange}
      />
    );
    expect(screen.getByLabelText("选择国家")).toBeInTheDocument();
    expect(screen.getByText("中国")).toBeInTheDocument();
    expect(screen.getByText("日本")).toBeInTheDocument();
  });

  it("hides country filter when countries is empty", () => {
    render(
      <RegionFilter
        regions={regions}
        selectedRegion=""
        onRegionChange={onRegionChange}
      />
    );
    expect(screen.queryByLabelText("选择国家")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <RegionFilter
        regions={regions}
        selectedRegion=""
        onRegionChange={onRegionChange}
        className="custom-class"
      />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});

describe("IndustryFilter", () => {
  const industries = ["电子", "机械", "医疗"];
  const onIndustryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders industry options from industries prop", () => {
    render(
      <IndustryFilter
        industries={industries}
        selectedIndustry=""
        onIndustryChange={onIndustryChange}
      />
    );
    expect(screen.getByText("电子")).toBeInTheDocument();
    expect(screen.getByText("机械")).toBeInTheDocument();
    expect(screen.getByText("医疗")).toBeInTheDocument();
  });

  it("calls onIndustryChange when selecting an industry", () => {
    render(
      <IndustryFilter
        industries={industries}
        selectedIndustry=""
        onIndustryChange={onIndustryChange}
      />
    );
    const select = screen.getByLabelText("选择行业");
    fireEvent.change(select, { target: { value: "电子" } });
    expect(onIndustryChange).toHaveBeenCalledWith("电子");
  });

  it("has default '全部行业' option", () => {
    render(
      <IndustryFilter
        industries={industries}
        selectedIndustry=""
        onIndustryChange={onIndustryChange}
      />
    );
    expect(screen.getByText("全部行业")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <IndustryFilter
        industries={industries}
        selectedIndustry=""
        onIndustryChange={onIndustryChange}
        className="my-filter"
      />
    );
    const select = screen.getByLabelText("选择行业");
    expect(select).toHaveClass("my-filter");
  });
});
