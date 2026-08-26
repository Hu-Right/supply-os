/**
 * NoticeSearchBar 组件测试
 * P0 — 公采搜索栏：关键词 + 排序 + 高级筛选折叠
 *
 * 三维评估：逻辑 ✅ | 业务 ✅ | 频改 ✅ → 必须测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoticeSearchBar } from "@/features/procurement/components/NoticeSearchBar";

const mockForm = {
  qInput: "", setQInput: vi.fn(),
  fromInput: "", setFromInput: vi.fn(),
  toInput: "", setToInput: vi.fn(),
  windowInput: "", setWindowInput: vi.fn(),
  agencyInput: "", setAgencyInput: vi.fn(),
  countryInput: "", setCountryInput: vi.fn(),
  typeInput: "", setTypeInput: vi.fn(),
};

const mockQuery = {
  activeQ: "", activeSort: "deadline_farthest" as const,
  activeCountry: "", activeAgency: "",
  activeFrom: "", activeTo: "",
  activeWindow: "", activeNoticeType: "",
  activeFeatured: false, hasSearch: false, searchKey: "",
};

const defaultProps = {
  form: mockForm,
  query: mockQuery,
  countries: [{ country: "US", count: 100 }],
  agencies: [{ agency: "UNDP", count: 50 }],
  applySearch: vi.fn(),
  clearSearch: vi.fn(),
  toggleFeatured: vi.fn(),
};

describe("NoticeSearchBar", () => {
  it("渲染搜索输入框（placeholder 为 i18n key）", () => {
    render(<NoticeSearchBar {...defaultProps} />);
    // Input 组件的 placeholder 是 t() 返回的 key
    const searchInput = screen.getByPlaceholderText("procurement_searchPlaceholder");
    expect(searchInput).toBeTruthy();
  });

  it("输入关键词 → 调用 setQInput", () => {
    render(<NoticeSearchBar {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText("procurement_searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "medical" } });
    expect(mockForm.setQInput).toHaveBeenCalledWith("medical");
  });

  it("提交表单 → 调用 applySearch", () => {
    render(<NoticeSearchBar {...defaultProps} />);
    const form = screen.getByPlaceholderText("procurement_searchPlaceholder").closest("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(defaultProps.applySearch).toHaveBeenCalled();
  });

  it("排序下拉框 → 包含排序选项", () => {
    render(<NoticeSearchBar {...defaultProps} />);
    const sortSelect = screen.getByLabelText("procurement_sortByDeadlineFarthest");
    expect(sortSelect).toBeTruthy();
    expect(sortSelect.tagName).toBe("SELECT");
  });

  it("高级筛选按钮 → 可点击", () => {
    render(<NoticeSearchBar {...defaultProps} />);
    const advBtn = screen.getByText("procurement_advancedFilter");
    expect(advBtn).toBeTruthy();
    fireEvent.click(advBtn);
  });
});
