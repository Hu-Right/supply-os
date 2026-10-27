/**
 * mock-paid 路由测试 —— auth/payment 错误码治本回归
 * @module tests/unit/api/payments/mock-paid.test.ts
 * @description 证明「订单不存在」走 EC_PAYMENT_ORDER_NOT_FOUND(40402→payErrOrderNotFound)，
 *              不再误用 40404（= EC_NOTICE_NOT_FOUND_404 → errNoticeNotFound「公告不存在」）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));

import { POST } from "@/app/api/payments/[orderNo]/mock-paid/route";
import { getContext } from "@/lib/db/context";
import { EC_PAYMENT_ORDER_NOT_FOUND } from "@/shared/constants/api";

function makeReq() {
  return new NextRequest("http://localhost/api/payments/x/mock-paid", { method: "POST" });
}

describe("POST /api/payments/[orderNo]/mock-paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContext).mockReturnValue({ payment: { paymentMode: "mock" } } as never);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("生产环境封死入口 → 404/EC_PAYMENT_ORDER_NOT_FOUND（非 40404 公告码）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(makeReq(), { params: Promise.resolve({ orderNo: "x" }) } as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe(EC_PAYMENT_ORDER_NOT_FOUND);
    expect(body.code).not.toBe(40404);
  });
});
