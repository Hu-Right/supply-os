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

// ── Mock list components (markers exposing onOpenNotice) ──
vi.mock("@/features/payment/components/OrderHistoryList", () => ({
  OrderHistoryList: ({ orders, onOpenNotice }: any) => (
    <div data-testid="order-list">
      <span>orders:{orders.length}</span>
      <button onClick={() => onOpenNotice(42)}>open-notice</button>
    </div>
  ),
}));
vi.mock("@/features/payment/components/UnlockHistoryList", () => ({
  UnlockHistoryList: ({ unlocks, onOpenNotice }: any) => (
    <div data-testid="unlock-list">
      <span>unlocks:{unlocks.length}</span>
      <button onClick={() => onOpenNotice(7)}>open-notice-unlock</button>
    </div>
  ),
}));

function baseHistory(overrides = {}) {
  return {
    tab: "orders",
    setTab: mockSetTab,
    page: 1,
    setPage: mockSetPage,
    limit: 10,
    orders: { list: [{ order_no: "O-1" }], total: 1 },
    unlocks: { list: [{ id: 1 }], total: 1 },
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

  it("renders overview with two drill-down cards", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.getByText("myPurchasesTitle")).toBeInTheDocument();
    expect(screen.getByText("myPurchasesTabOrders")).toBeInTheDocument();
    expect(screen.getByText("myPurchasesTabUnlocks")).toBeInTheDocument();
    // 概览态不渲染列表
    expect(screen.queryByTestId("order-list")).toBeNull();
  });

  it("renders count badges and first-record previews on overview cards", () => {
    mockSummary = baseSummary({
      ordersTotal: 3,
      unlocksTotal: 5,
      ordersFirst: { order_no: "O-9", notice: { title: "订单公告A" } },
      unlocksFirst: { notice_id: 88, notice: { title: "解锁公告B" } },
    });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("myRecordsLatest: 订单公告A")).toBeInTheDocument();
    expect(screen.getByText("myRecordsLatest: 解锁公告B")).toBeInTheDocument();
  });

  it("falls back to order_no / notice id when preview title is missing", () => {
    mockSummary = baseSummary({
      ordersTotal: 1,
      unlocksTotal: 1,
      ordersFirst: { order_no: "O-42", notice: null },
      unlocksFirst: { notice_id: 77, notice: null },
    });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.getByText("myRecordsLatest: O-42")).toBeInTheDocument();
    expect(screen.getByText("myRecordsLatest: #77")).toBeInTheDocument();
  });

  it("hides badges and previews when totals are zero", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    expect(screen.queryByText("myRecordsLatest:", { exact: false })).toBeNull();
  });

  it("drills into orders view and back to overview", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myPurchasesTabOrders"));
    expect(mockSetTab).toHaveBeenCalledWith("orders");
    expect(screen.getByTestId("order-list")).toBeInTheDocument();
    expect(screen.getByText("orders:1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("myRecordsBackToOverview"));
    expect(screen.queryByTestId("order-list")).toBeNull();
    expect(screen.getByText("myPurchasesTitle")).toBeInTheDocument();
  });

  it("drills into unlocks view", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myPurchasesTabUnlocks"));
    expect(mockSetTab).toHaveBeenCalledWith("unlocks");
    expect(screen.getByTestId("unlock-list")).toBeInTheDocument();
  });

  it("triggers history refresh from the drill-down refresh button", () => {
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myPurchasesTabOrders"));
    fireEvent.click(screen.getByLabelText("myRecordsRefresh"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("forwards onOpenNotice from the orders list", () => {
    const onOpenNotice = vi.fn();
    render(<MyRecordsPanel onOpenNotice={onOpenNotice} />);
    fireEvent.click(screen.getByText("myPurchasesTabOrders"));
    fireEvent.click(screen.getByText("open-notice"));
    expect(onOpenNotice).toHaveBeenCalledWith(42);
  });

  it("shows empty state when the orders list is empty", () => {
    mockHistory = baseHistory({ orders: { list: [], total: 0 } });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myPurchasesTabOrders"));
    expect(screen.getByText("myPurchasesEmptyOrders")).toBeInTheDocument();
  });

  it("shows load-failed state with retry", () => {
    mockHistory = baseHistory({ error: "load_failed" });
    render(<MyRecordsPanel onOpenNotice={vi.fn()} />);
    fireEvent.click(screen.getByText("myPurchasesTabOrders"));
    expect(screen.getByText("myPurchasesLoadFailed")).toBeInTheDocument();
    fireEvent.click(screen.getByText("myPurchasesRetry"));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
