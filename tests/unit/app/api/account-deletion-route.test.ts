/**
 * 账号注销申请端点：验证码提交、阻塞项返回、幂等复用。
 * 全程假服务层，不连库、不发邮件。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireUserKeyOrThrow: vi.fn(),
  submit: vi.fn(),
  status: vi.fn(),
}));

vi.mock("@/lib/db/context", () => ({ getContext: () => ({ dbPool: {} }) }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: mocks.requireUserKeyOrThrow }));
vi.mock("@/lib/services/account-deletion", () => ({
  submitAccountDeletion: mocks.submit,
  accountDeletionStatusViewOf: mocks.status,
}));

import { GET, POST } from "@/app/api/user/account-deletion/route";

const postReq = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/user/account-deletion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKeyOrThrow.mockResolvedValue({ userId: 7, authViaJwt: true });
  mocks.status.mockResolvedValue(null);
  mocks.submit.mockResolvedValue({
    ok: true, id: 1, status: "cooling", coolingUntil: "2026-12-04T00:00:00.000Z", duplicate: false,
  });
});

describe("GET /api/user/account-deletion", () => {
  it("返回最近一次申请（含冷静期/阻塞项）", async () => {
    const body = await (await GET(new NextRequest("http://localhost:3000/api/user/account-deletion"), {} as never)).json();
    expect(body).toEqual({ request: null });

    mocks.status.mockResolvedValue({
      id: 3, status: "cooling", coolingUntil: "2026-12-04T00:00:00.000Z",
      blockers: [], createdAt: "2026-11-27 20:00:00", handledNote: null,
    });
    const body2 = await (await GET(new NextRequest("http://localhost:3000/api/user/account-deletion"), {} as never)).json();
    expect(body2.request.status).toBe("cooling");
  });
});

describe("POST /api/user/account-deletion", () => {
  it("带验证码提交 → 201 且返回冷静期", async () => {
    const res = await POST(postReq({ code: "123456" }), {} as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.request.status).toBe("cooling");
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 7, code: "123456" }),
    );
  });

  it("缺少验证码 → 400（schema 拦截）", async () => {
    const res = await POST(postReq({}), {} as never);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("存在未结清事项 → 200 + blocked + blockers", async () => {
    mocks.submit.mockResolvedValue({ ok: false, blocked: true, blockers: ["有 1 笔未支付订单"] });
    const res = await POST(postReq({ code: "123456" }), {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
    expect(body.blockers).toEqual(["有 1 笔未支付订单"]);
  });

  it("已有进行中申请 → 200 且 duplicate=true", async () => {
    mocks.submit.mockResolvedValue({
      ok: true, id: 9, status: "cooling", coolingUntil: null, duplicate: true,
    });
    const res = await POST(postReq({ code: "123456" }), {} as never);
    expect(res.status).toBe(200);
  });
});
