/**
 * src/features/payment/api.ts 测试
 * 覆盖 createOrder, getOrderStatus, mockPaid, fetchOrders, fetchUnlocks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
const apiCachedMock = vi.fn();
const buildQueryMock = vi.fn((params: Record<string, any>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&"),
);
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
  apiCached: (...args: any[]) => apiCachedMock(...args),
  buildQuery: (params: Record<string, any>) => buildQueryMock(params),
}));

import {
  createOrder, getOrderStatus, mockPaid, fetchOrders, fetchUnlocks,
} from "@/features/payment/api";

describe("createOrder", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ order_no: "SO-001", status: "pending" });
  });

  it("POST 发送基本参数", async () => {
    await createOrder({ planCode: "annual_799", provider: "alipay" });
    expect(apiMock).toHaveBeenCalledWith("/api/payment/orders", {
      method: "POST",
      body: expect.objectContaining({
        plan_code: "annual_799",
        provider: "alipay",
        order_type: "new",
      }),
    });
  });

  it("noticeId 传 null 当未提供", async () => {
    await createOrder({ planCode: "basic", provider: "mock" });
    const body = apiMock.mock.calls[0][1].body;
    expect(body.notice_id).toBeNull();
  });

  it("upgrade 订单传 order_type 和 original_plan_code", async () => {
    await createOrder({
      planCode: "annual_5600", provider: "alipay",
      orderType: "upgrade", originalPlanCode: "annual_799",
    });
    const body = apiMock.mock.calls[0][1].body;
    expect(body.order_type).toBe("upgrade");
    expect(body.original_plan_code).toBe("annual_799");
  });
});

describe("getOrderStatus", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ order_no: "SO-001", status: "paid" });
  });

  it("无 tradeNo 时简单路径", async () => {
    await getOrderStatus("SO-001");
    expect(apiMock).toHaveBeenCalledWith("/api/payment/orders/SO-001");
  });

  it("有 tradeNo 时附加查询参数", async () => {
    await getOrderStatus("SO-001", "TRADE-123");
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("trade_no=TRADE-123"),
    );
  });
});

describe("mockPaid", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(undefined);
  });

  it("POST 到 mock-paid 端点", async () => {
    await mockPaid("SO-001");
    expect(apiMock).toHaveBeenCalledWith("/api/payments/SO-001/mock-paid", {
      method: "POST",
    });
  });
});

describe("fetchOrders", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ total: 0, page: 1, limit: 10, list: [] });
  });

  it("传分页参数", async () => {
    await fetchOrders({ page: 2, limit: 20 });
    expect(buildQueryMock).toHaveBeenCalledWith({
      status: undefined,
      page: 2,
      limit: 20,
    });
  });

  it("传 status 过滤", async () => {
    await fetchOrders({ status: "paid" });
    expect(buildQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    );
  });
});

describe("fetchUnlocks", () => {
  beforeEach(() => {
    apiCachedMock.mockReset();
    apiCachedMock.mockResolvedValue({ total: 0, page: 1, limit: 10, list: [] });
  });

  it("使用 apiCached 带 5 分钟 TTL", async () => {
    await fetchUnlocks({ page: 1 });
    expect(apiCachedMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/payment/unlocks"),
      5 * 60 * 1000,
    );
  });

  it("有效 locale 传 lang", async () => {
    await fetchUnlocks({ locale: "fr" });
    expect(buildQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "fr" }),
    );
  });

  it("无效 locale 不传 lang", async () => {
    await fetchUnlocks({ locale: "de" });
    expect(buildQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ lang: undefined }),
    );
  });
});
