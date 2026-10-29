/**
 * /api/training/orders/:orderNo/participants 集成测试 — 红线②【丙】组最后一处收口
 *
 * @description GET 的 `participants` 是 `SELECT * FROM training_participants` 整行
 *              （11 列：id/order_id/participant_no/full_name/gender/phone/company_name/
 *              position/email/created_at/updated_at，其中 6 列带下划线），学员姓名与手机号原样上网。
 *              真库实测两张表 0 行（生产无数据可达），所以键集合只能从代码侧钉——
 *              这不构成不切的理由（面还在网上）。
 *              隐私口径一并确认：这是订单归属人读回自己提交的学员名单，姓名/电话/邮箱属于自填回显，
 *              不下发的是 order_id / 时间戳（前端契约里也没有）。
 *
 *              同时钉住读写分离：POST 请求体仍以列名 `full_name`/`email` 入参（红线②只约束响应实体字段）。
 *              `email` 是真列（baseline:2298）：旧注释误判为幻影字段，实际是写入链路漏写，
 *              已于本批补齐（INSERT 形状由 tests/unit/lib/repos/training-repo-participants.test.ts 钉）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

const PARTICIPANT_ROWS = [
  {
    id: 1, order_id: 7, participant_no: 1, full_name: "张三", gender: "男",
    phone: "13800000000", company_name: "某公司", position: "采购经理",
    email: "zhang@example.com",
    created_at: new Date("2026-10-01T00:00:00Z"), updated_at: null,
  },
  {
    id: 2, order_id: 7, participant_no: 2, full_name: "李四", gender: null,
    phone: null, company_name: null, position: null, email: null,
    created_at: new Date("2026-10-01T00:00:00Z"), updated_at: null,
  },
];

const saveParticipants = vi.fn(async () => {});
const findOrderByNo = vi.fn(async () => ({
  id: 7, user_id: 7, status: "paid", participant_count: 2,
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    trainingRepo: {
      findOrderByNo,
      getParticipantsByOrderId: async () => PARTICIPANT_ROWS,
      saveParticipants,
    },
  }),
}));

const snakeKeys = (obj: unknown): string[] =>
  Object.keys(obj as object).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));

const url = "http://localhost:3000/api/training/orders/TR2026/participants";

beforeEach(() => {
  saveParticipants.mockClear();
  findOrderByNo.mockClear();
});

describe("GET /api/training/orders/[orderNo]/participants", () => {
  it("学员键集合 = 前端契约的 camel 形态；order_id 与两个时间戳不上网", async () => {
    const { GET } = await import("@/app/api/training/orders/[orderNo]/participants/route");
    const body = await (await GET(new NextRequest(url), { params: Promise.resolve({ orderNo: "TR2026" }) })).json();

    expect(Object.keys(body.participants[0]).sort()).toEqual(
      ["companyName", "email", "fullName", "gender", "participantNo", "phone", "position"].sort(),
    );
    expect(snakeKeys(body.participants[0])).toEqual([]);
    expect(snakeKeys(body)).toEqual([]);
    expect(body.participantCount).toBe(2);
  });

  it("值原样回显（订单归属人读自己提交的名单，本批不改数据形态）", async () => {
    const { GET } = await import("@/app/api/training/orders/[orderNo]/participants/route");
    const body = await (await GET(new NextRequest(url), { params: Promise.resolve({ orderNo: "TR2026" }) })).json();

    expect(body.participants[0]).toEqual({
      participantNo: 1, fullName: "张三", gender: "男", phone: "13800000000",
      companyName: "某公司", position: "采购经理", email: "zhang@example.com",
    });
    expect(body.participants[1].gender).toBeNull();
    expect(body.participants[1].email).toBeNull();
  });
});

describe("POST /api/training/orders/[orderNo]/participants", () => {
  it("请求体仍吃列名 full_name/email：仓储收到原样键，不做 camel 化（读写口径分离）", async () => {
    const { POST } = await import("@/app/api/training/orders/[orderNo]/participants/route");
    const res = await POST(
      new NextRequest(url, {
        method: "POST",
        body: JSON.stringify({
          participants: [
            { participant_no: 1, full_name: "张三", email: "zhang@example.com" },
            { participant_no: 2, full_name: "李四" },
          ],
        }),
      } as never),
      { params: Promise.resolve({ orderNo: "TR2026" }) },
    );

    expect(res.status).toBe(200);
    expect(saveParticipants).toHaveBeenCalledWith(7, [
      { participant_no: 1, full_name: "张三", email: "zhang@example.com" },
      { participant_no: 2, full_name: "李四" },
    ]);
  });
});
