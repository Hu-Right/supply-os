import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import SupplierPage from "@/features/supplier/pages/SupplierPage";

// ── Mock supplier api (DB-backed list + contact + register) ──
const mockFetchSuppliers = vi.fn();
const mockFetchContact = vi.fn();
vi.mock("@/features/supplier/api", () => ({
  fetchSuppliers: (lang: string) => mockFetchSuppliers(lang),
  fetchSupplierContact: (id: string, userKey: string) => mockFetchContact(id, userKey),
  registerSupplier: vi.fn(),
}));

// ── Mock useAuth (mutable per-test) ──
const mockAuth = {
  authUser: null as any,
  isVip: false,
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

// ── Mock SupplierRegisterModal (marker with onRegistered trigger) ──
vi.mock("@/features/supplier/components/SupplierRegisterModal", () => ({
  SupplierRegisterModal: ({ onClose, onRegistered }: any) => (
    <div data-testid="register-modal">
      <button onClick={onRegistered}>trigger-registered</button>
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

// ── Mock SupplierCard ──
vi.mock("@/features/supplier/components/SupplierCard", () => ({
  SupplierCard: ({ supplier, onAiMatch, onContact }: any) => (
    <div data-testid={`supplier-card-${supplier.id}`}>
      <span>{supplier.nameZh}</span>
      <button onClick={() => onAiMatch(supplier)}>ai-match</button>
      <button onClick={() => onContact(supplier)}>contact</button>
    </div>
  ),
}));

// ── Mock useLocale (mutable locale for refetch test) ──
const localeState = { locale: "zh" };
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: localeState.locale }),
  pickLocale: (l: string, zh: string, en: string) => (l === "zh" ? zh : en),
}));

// ── Mock useNavigate ──
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// DB-backed suppliers as mapped by GET /api/suppliers (masked contacts)
const DB_SUPPLIERS = [
  {
    id: "sup-db-72", nameZh: "深圳安博深科技有限公司", nameEn: "深圳安博深科技有限公司",
    type: "domestic", industryZh: "电子", industryEn: "Electronics",
    contactPerson: "张三", contactEmail: "an***@test.com", contactPhone: "138****1686",
    ungmCode: undefined, status: "approved",
  },
  {
    id: "sup-db-71", nameZh: "杭州绿能装备股份有限公司", nameEn: "杭州绿能装备股份有限公司",
    type: "domestic", industryZh: "机械", industryEn: "Machinery",
    contactPerson: "李四", contactEmail: "li***@test.com", contactPhone: "139****0001",
    ungmCode: undefined, status: "approved",
  },
  {
    id: "sup-db-70", nameZh: "环球贸易公司", nameEn: "Global Trading Co.",
    type: "international", industryZh: "贸易", industryEn: "Trading",
    contactPerson: "John", contactEmail: "jo***@test.com", contactPhone: "+1***456",
    ungmCode: "12345678", status: "approved",
  },
];

// 批量构造 DB 形状供应商（分页用例）
const makeSuppliers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `sup-db-${100 + i}`,
    nameZh: `批量供应商${100 + i}`,
    nameEn: `Bulk Supplier ${100 + i}`,
    type: "domestic",
    industryZh: "电子",
    industryEn: "Electronics",
    contactPerson: "张三",
    contactEmail: "an***@test.com",
    contactPhone: "138****1686",
    ungmCode: undefined,
    status: "approved",
  }));

describe("SupplierPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localeState.locale = "zh";
    mockAuth.authUser = null;
    mockAuth.isVip = false;
    mockFetchSuppliers.mockResolvedValue(DB_SUPPLIERS);
  });

  it("renders type filter tabs (all/domestic/international)", async () => {
    render(<SupplierPage />);
    expect(screen.getByText("supplierFilterAll")).toBeInTheDocument();
    expect(screen.getByText("supplierFilterDomestic")).toBeInTheDocument();
    expect(screen.getByText("supplierFilterIntl")).toBeInTheDocument();
    await waitFor(() => expect(mockFetchSuppliers).toHaveBeenCalled());
  });

  it("renders DB suppliers fetched with current locale", async () => {
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    expect(screen.getByTestId("supplier-card-sup-db-71")).toBeInTheDocument();
    expect(mockFetchSuppliers).toHaveBeenCalledWith("zh");
  });

  it("re-fetches the list when locale changes", async () => {
    const { rerender } = render(<SupplierPage />);
    await waitFor(() => expect(mockFetchSuppliers).toHaveBeenCalledWith("zh"));
    localeState.locale = "fr";
    rerender(<SupplierPage />);
    await waitFor(() => expect(mockFetchSuppliers).toHaveBeenCalledWith("fr"));
  });

  it("filters by type: domestic only", async () => {
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-70")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("supplierFilterDomestic"));
    expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    expect(screen.queryByTestId("supplier-card-sup-db-70")).toBeNull();
  });

  it("filters by search term", async () => {
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("searchSupplierPlaceholder");
    fireEvent.change(input, { target: { value: "安博深" } });
    expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    expect(screen.queryByTestId("supplier-card-sup-db-71")).toBeNull();
  });

  it("AI match button navigates to /crm carrying the supplier in router state", async () => {
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    const card = screen.getByTestId("supplier-card-sup-db-72");
    fireEvent.click(card.querySelector("button")!);
    expect(mockNavigate).toHaveBeenCalledWith("/crm", {
      state: { aiMatchSupplier: expect.objectContaining({ id: "sup-db-72" }) },
    });
  });

  it("shows empty state when the list fetch fails", async () => {
    mockFetchSuppliers.mockRejectedValue(new Error("boom"));
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByText("noData")).toBeInTheDocument();
    });
  });

  it("shows empty state when no match", async () => {
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("searchSupplierPlaceholder");
    fireEvent.change(input, { target: { value: "nonexistent_xyz" } });
    expect(screen.getByText("noData")).toBeInTheDocument();
  });

  it("does not render an inline register button (remote-aligned, entry lives in banner)", async () => {
    render(<SupplierPage />);
    expect(screen.queryByText("supplierRegOpenBtn")).toBeNull();
    // 等待列表请求落定，避免 loading→loaded 的 setState 泄漏到测试外
    await waitFor(() => expect(mockFetchSuppliers).toHaveBeenCalled());
    await act(async () => {});
  });

  it("opens the register modal on supply-os:open-supplier-register event", async () => {
    render(<SupplierPage />);
    expect(screen.queryByTestId("register-modal")).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent("supply-os:open-supplier-register"));
    });
    expect(screen.getByTestId("register-modal")).toBeInTheDocument();
    await act(async () => {});
  });

  it("reloads suppliers after a successful registration", async () => {
    render(<SupplierPage />);
    await waitFor(() => expect(mockFetchSuppliers).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new CustomEvent("supply-os:open-supplier-register"));
    });
    fireEvent.click(screen.getByText("trigger-registered"));
    await waitFor(() => expect(mockFetchSuppliers).toHaveBeenCalledTimes(2));
  });

  it("VIP user: contact button fetches plaintext contact and shows it", async () => {
    mockAuth.authUser = { user_key: "vip@test.com" };
    mockAuth.isVip = true;
    mockFetchContact.mockResolvedValue({
      contactPerson: "张三",
      contactEmail: "zhangsan@real.com",
      contactPhone: "13800001686",
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    const card = screen.getByTestId("supplier-card-sup-db-72");
    fireEvent.click(card.querySelectorAll("button")[1]);
    await waitFor(() => {
      expect(mockFetchContact).toHaveBeenCalledWith("sup-db-72", "vip@test.com");
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("13800001686"));
    });
    alertSpy.mockRestore();
  });

  it("non-VIP user: contact button shows VIP-only hint without fetching", async () => {
    mockAuth.authUser = { user_key: "free@test.com" };
    mockAuth.isVip = false;
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    const card = screen.getByTestId("supplier-card-sup-db-72");
    fireEvent.click(card.querySelectorAll("button")[1]);
    expect(alertSpy).toHaveBeenCalledWith("supplierContactVipOnly");
    expect(mockFetchContact).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("VIP user: shows failure hint when contact fetch fails", async () => {
    mockAuth.authUser = { user_key: "vip@test.com" };
    mockAuth.isVip = true;
    mockFetchContact.mockRejectedValue(new Error("VIP_REQUIRED"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
    });
    const card = screen.getByTestId("supplier-card-sup-db-72");
    fireEvent.click(card.querySelectorAll("button")[1]);
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("supplierContactFailed");
    });
    alertSpy.mockRestore();
  });

  // ── 骨架屏（结构对齐 SupplierCard，加载完成后替换为真实数据）──

  it("shows 9 skeleton cards while loading, then swaps in real cards", async () => {
    let resolveList!: (value: unknown) => void;
    mockFetchSuppliers.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));
    render(<SupplierPage />);

    // 加载中：9 个骨架占位，不显示空状态
    expect(screen.getAllByTestId("supplier-skeleton")).toHaveLength(9);
    expect(screen.queryByText("noData")).toBeNull();

    await act(async () => {
      resolveList(DB_SUPPLIERS);
    });
    // 加载完成：骨架消失，真实卡片渲染
    expect(screen.queryAllByTestId("supplier-skeleton")).toHaveLength(0);
    expect(screen.getByTestId("supplier-card-sup-db-72")).toBeInTheDocument();
  });

  // ── 分页（每页 9 条，控件复用公采 ProcurementPagination）──

  it("paginates 9 per page and navigates with next/prev controls", async () => {
    mockFetchSuppliers.mockResolvedValue(makeSuppliers(12));
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-100")).toBeInTheDocument();
    });
    // 第 1 页仅 9 条，第 10 条（sup-db-109）不可见
    expect(screen.getAllByTestId(/^supplier-card-/)).toHaveLength(9);
    expect(screen.queryByTestId("supplier-card-sup-db-109")).toBeNull();

    fireEvent.click(screen.getByText("procurement_next"));
    // 第 2 页剩余 3 条
    expect(screen.getAllByTestId(/^supplier-card-/)).toHaveLength(3);
    expect(screen.getByTestId("supplier-card-sup-db-109")).toBeInTheDocument();
    expect(screen.queryByTestId("supplier-card-sup-db-100")).toBeNull();

    fireEvent.click(screen.getByText("procurement_prev"));
    expect(screen.getByTestId("supplier-card-sup-db-100")).toBeInTheDocument();
  });

  it("resets to page 1 when a filter changes", async () => {
    const suppliers = makeSuppliers(12);
    mockFetchSuppliers.mockResolvedValue(suppliers);
    render(<SupplierPage />);
    await waitFor(() => {
      expect(screen.getByTestId("supplier-card-sup-db-100")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("procurement_next"));
    expect(screen.queryByTestId("supplier-card-sup-db-100")).toBeNull();

    // 第 2 页上修改搜索词：应回第 1 页并展示匹配结果
    fireEvent.change(screen.getByPlaceholderText("searchSupplierPlaceholder"), {
      target: { value: "批量供应商100" },
    });
    expect(screen.getByTestId("supplier-card-sup-db-100")).toBeInTheDocument();
  });
});
