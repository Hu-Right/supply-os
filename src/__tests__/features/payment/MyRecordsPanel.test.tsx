import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MyRecordsPanel } from "@/features/payment/components/MyRecordsPanel";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// ── Mock useAuth ──
const mockAuth = { authUser: null as any };
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

// ── Mock useOrderHistory ──
const mockSetTab = vi.fn();
const mockSetPage = vi.fn();
const mockRefresh = vi.fn();
let mockHistory: any;
vi.mock("@/features/payment/hooks/useOrderHistory", () => ({
  useOrderHistory: () => mockHistory,
}));

// ── Mock useRecordsSummary ──
const mockSummaryRefresh = vi.fn();
let mockSummary: any;
vi.mock("@/features/payment/hooks/useRecordsSummary", () => ({
  useRecordsSummary: () => mockSummary,
}));

const paidOrder = {
  order_no: "O-1",
  status: "paid",
  amount: 99,
  currency: "CNY",
  notice_id: 42,
  created_at: "2026-07-01T08:00:00.000Z",
  notice: { title: "订单公告A" },
};

const unlockRow = {
  notice_id: 7,
  unlock_type: "single",
  unlocked_at: "2026-07-02T09:30:00.000Z",
  notice: { title: "解锁公告B", country: "Kenya" },
};

function baseHistory(overrides = {}) {
  return {
    tab: "orders",
    setTab: mockSetTab,
    page: 1,
    setPage: mockSetPage,
    limit: 10,
    orders: { list: [paidOrder], total: 1 },
    unlocks: { list: [unlockRow], total: 1 },
    loading: false,
    error: "",
    total: 1,
    totalPages: 1,
    refresh: mockRefresh,
    ...overrides,
  };
}

function baseSummary(overrides = {}) {
  return {
    ordersTotal: 0,
    unlocksTotal: 0,
    ordersFirst: null as any,
    unlocksFirst: null as any,
    loading: false,
    refresh: mockSummaryRefresh,
    ...overrides,
  };
}

describe("MyRecordsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = { user_key: "uk_1", email: "a@b.com" };
    mockHistory = baseHistory();
    mockSummary = baseSummary();
  });

  it("shows login required when not authenticated", () => {
    mockAuth.authUser = null;
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.getByText("myPurchasesLoginRequired")).toBeInTheDocument();
  });

  it("renders overview with orders and unlocks cards", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.getByText("myRecordsOrdersTitle")).toBeInTheDocument();
    expect(screen.getByText("myRecordsUnlocksTitle")).toBeInTheDocument();
    // 概览态空预览兜底：空文案 + 引导提示
    expect(screen.getByText("myPurchasesEmptyOrders")).toBeInTheDocument();
    expect(screen.getByText("myRecordsOrdersHint")).toBeInTheDocument();
    expect(screen.getByText("myPurchasesEmptyUnlocks")).toBeInTheDocument();
    expect(screen.getByText("myRecordsUnlocksHint")).toBeInTheDocument();
    // 概览态不渲染管理列表
    expect(screen.queryByText("myRecordsOrdersManage")).toBeNull();
  });

  it("renders count badges and first-record previews on overview cards", () => {
    mockSummary = baseSummary({
      ordersTotal: 3,
      unlocksTotal: 5,
      ordersFirst: paidOrder,
      unlocksFirst: unlockRow,
    });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("订单公告A")).toBeInTheDocument();
    expect(screen.getByText("O-1")).toBeInTheDocument();
    expect(screen.getByText("解锁公告B")).toBeInTheDocument();
    // 解锁卡预览第二行为 yyyy-MM-dd HH:mm 格式时间
    expect(screen.getByText(/^2026-07-02 \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("drills into orders management view and back to overview", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(mockSetTab).toHaveBeenCalledWith("orders");
    expect(screen.getByText("myRecordsOrdersManage")).toBeInTheDocument();
    expect(screen.getByText("myRecordsOrdersManageDesc")).toBeInTheDocument();
    expect(screen.getByText("O-1")).toBeInTheDocument();
    expect(screen.getByText("myPurchasesStatus_paid")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("myRecordsBackTitle"));
    expect(screen.queryByText("myRecordsOrdersManage")).toBeNull();
    expect(screen.getByText("myRecordsOrdersTitle")).toBeInTheDocument();
  });

  it("drills into unlocks management view", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsUnlocksTitle"));
    expect(mockSetTab).toHaveBeenCalledWith("unlocks");
    expect(screen.getByText("myRecordsUnlocksManage")).toBeInTheDocument();
    expect(screen.getByText("解锁公告B")).toBeInTheDocument();
    expect(screen.getByText("Kenya")).toBeInTheDocument();
  });

  it("triggers history refresh from the management refresh button", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    fireEvent.click(screen.getByText("myRecordsRefresh"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows refreshing label while loading", () => {
    mockHistory = baseHistory({ loading: true });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(screen.getByText("myRecordsRefreshing")).toBeInTheDocument();
  });

  it("opens notice detail for paid orders with notice_id", () => {
    const onOpenNotice = vi.fn();
    render(<MyRecordsPanel onOpenNotice={onOpenNotice} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    fireEvent.click(screen.getByText("myPurchasesOpenDetail"));
    expect(onOpenNotice).toHaveBeenCalledWith(42);
  });

  it("hides open-detail for non-paid orders and shows raw status", () => {
    mockHistory = baseHistory({
      orders: { list: [{ ...paidOrder, status: "pending" }], total: 1 },
    });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(screen.queryByText("myPurchasesOpenDetail")).toBeNull();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("opens notice detail from unlock rows", () => {
    const onOpenNotice = vi.fn();
    render(<MyRecordsPanel onOpenNotice={onOpenNotice} />);
    fireEvent.click(screen.getByText("myRecordsUnlocksTitle"));
    fireEvent.click(screen.getByText("myPurchasesOpenDetail"));
    expect(onOpenNotice).toHaveBeenCalledWith(7);
  });

  it("shows empty state when the orders list is empty", () => {
    mockHistory = baseHistory({ orders: { list: [], total: 0 } });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(screen.getByText("myPurchasesEmptyOrders")).toBeInTheDocument();
  });

  it("shows loading text in empty state while loading", () => {
    mockHistory = baseHistory({ loading: true, orders: { list: [], total: 0 } });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(screen.getByText("myRecordsLoading")).toBeInTheDocument();
  });

  it("renders pager and pages through records", () => {
    mockHistory = baseHistory({ page: 2, total: 25, totalPages: 3 });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(screen.getByText("myRecordsPagerInfo")).toBeInTheDocument();

    fireEvent.click(screen.getByText("myPurchasesPrev"));
    expect(mockSetPage).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("myPurchasesNext"));
    expect(mockSetPage).toHaveBeenCalledWith(3);
  });

  it("disables pager buttons on boundary pages", () => {
    mockHistory = baseHistory({ page: 1, total: 5, totalPages: 1 });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myRecordsOrdersTitle"));
    expect(screen.getByText("myPurchasesPrev")).toBeDisabled();
    expect(screen.getByText("myPurchasesNext")).toBeDisabled();
  });
});
