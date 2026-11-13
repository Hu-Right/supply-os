/**
 * /api/training/orders/:orderNo/participants 集成测试 — 学员名单只读出口
 *
 * @description 2026-11-13 收敛后数据源为 `training_enrollments`（一行 = 一位学员），
 *              `training_participants` 已删除、POST 写入口已移除（报名接口在支付前一次写全）。
 *              本测试钉两件事：
 *                1. 对前端的 7 键 camel 契约不变（participantNo/fullName/gender/phone/
 *                   companyName/position/email），行元数据（id/user_id/order_id/ip/时间戳）不上网；
 *                2. 隐私口径不变：只能读自己订单的名单（路由校 user_id）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

const ENROLLMENT_ROWS = [
  {
    id: 11, user_id: 7, order_id: 55, schedule_id: 2, participant_no: 1,
    full_name: "张三", gender: "male", phone: "13800000000",
    company_name: "某公司", position: "采购经理", email: "zhang@example.com",
    invoice_email: "finance@example.com", main_product: null, export_experience: null,
    certification: null, remark: null, ip: "127.0.0.1",
    created_at: new Date("2026-11-13T00:00:00Z"), updated_at: null,
  },
  {
    id: 12, user_id: 7, order_id: 55, schedule_id: 2, participant_no: 2,
    full_name: "李四", gender: null, phone: "13900000000",
    company_name: "某公司", position: null, email: null,
    invoice_email: "finance@example.com", main_product: null, export_experience: null,
    certification: null, remark: null, ip: "127.0.0.1",
    created_at: new Date("2026-11-13T00:00:00Z"), updated_at: null,
  },
];

const listEnrollmentsByOrderId = vi.fn(async () => ENROLLMENT_ROWS);
const findOrderByNo = vi.fn(async () => ({
  id: 55, user_id: 7, status: "paid", participant_count: 2,
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    trainingRepo: { findOrderByNo, listEnrollmentsByOrderId },
  }),
}));

const snakeKeys = (obj: unknown): string[] =>
  Object.keys(obj as object).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));

const url = "http://localhost:3000/api/training/orders/TR2026/participants";

beforeEach(() => {
  listEnrollmentsByOrderId.mockClear();
  findOrderByNo.mockClear();
});

describe("GET /api/training/orders/[orderNo]/participants", () => {
  it("键集合 = 前端契约的 camel 形态；order_id/ip/时间戳不上网", async () => {
    const { GET } = await import("@/app/api/training/orders/[orderNo]/participants/route");
    const body = await (await GET(new NextRequest(url), { params: Promise.resolve({ orderNo: "TR2026" }) })).json();

    expect(Object.keys(body.participants[0]).sort()).toEqual(
      ["companyName", "email", "fullName", "gender", "participantNo", "phone", "position"].sort(),
    );
    expect(snakeKeys(body.participants[0])).toEqual([]);
    expect(snakeKeys(body)).toEqual([]);
    expect(body.participantCount).toBe(2);
  });

  it("值原样回显；名单按订单读 enrollments", async () => {
    const { GET } = await import("@/app/api/training/orders/[orderNo]/participants/route");
    const body = await (await GET(new NextRequest(url), { params: Promise.resolve({ orderNo: "TR2026" }) })).json();

    expect(body.participants[0]).toEqual({
      participantNo: 1, fullName: "张三", gender: "male", phone: "13800000000",
      companyName: "某公司", position: "采购经理", email: "zhang@example.com",
    });
    expect(body.participants[1].gender).toBeNull();
    expect(body.participants[1].email).toBeNull();
    expect(listEnrollmentsByOrderId).toHaveBeenCalledWith(55);
  });

  it("POST 写入口已移除（学员在报名时一次写全）", async () => {
    const route = await import("@/app/api/training/orders/[orderNo]/participants/route");
    expect("POST" in route).toBe(false);
  });
});
