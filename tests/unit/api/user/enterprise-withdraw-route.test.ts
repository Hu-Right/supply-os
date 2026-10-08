/**
 * POST /api/user/enterprise/withdraw — 自助撤回企业绑定测试
 * @module tests/unit/api/user/enterprise-withdraw-route.test.ts
 * @description 路线三给「绑错主体」一条正路：未拿下认证的绑定可以自助撤回重来，
 *              已认证的必须走后台/客服。端点**不接收 supplierId**——只作用于当前账号
 *              自己的绑定，避免变成拆别人绑定的口子；重复调用幂等。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: poolExecute }) }));
vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: vi.fn(() => null) }));

import { POST } from "@/app/api/user/enterprise/withdraw/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";

function buildCtx(boundSubjectRow: Record<string, unknown> | null) {
  return {
    ctx: { supplier: { directoryRepo: { findBoundSubjectByUserId: vi.fn().mockResolvedValue(boundSubjectRow) } } },
  };
}

function withdrawReq(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/user/enterprise/withdraw", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/user/enterprise/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolExecute.mockResolvedValue([{ affectedRows: 1 }]);
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
    vi.mocked(checkRateLimit).mockReturnValue(null as never);
  });

  it("审核中绑定 → 撤回，返回旧主体供前端提示", async () => {
    vi.mocked(getContext).mockReturnValue(
      buildCtx({ id: 100, company: "杭州原绑定企业有限公司", verify_status: "pending", claim_status: null }).ctx as never,
    );

    const res = await POST(withdrawReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      withdrawn: true,
      company: "杭州原绑定企业有限公司",
      state: "pending",
    });
    expect(poolExecute).toHaveBeenCalledTimes(3);
  });

  it("已认证绑定 → 400，不写任何表（换绑必须走后台/客服）", async () => {
    vi.mocked(getContext).mockReturnValue(
      buildCtx({ id: 100, company: "已认证公司", verify_status: "done", claim_status: null }).ctx as never,
    );

    const res = await POST(withdrawReq());
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("联系客服");
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("未绑定 → 幂等 200，withdrawn=false，不写任何表", async () => {
    vi.mocked(getContext).mockReturnValue(buildCtx(null).ctx as never);

    const res = await POST(withdrawReq());
    expect(res.status).toBe(200);
    expect((await res.json()).data.withdrawn).toBe(false);
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("忽略请求体：不接受 supplierId，只作用于当前账号自己的绑定", async () => {
    vi.mocked(getContext).mockReturnValue(
      buildCtx({ id: 100, company: "旧公司", verify_status: "pending", claim_status: null }).ctx as never,
    );

    const res = await POST(withdrawReq({ supplierId: 999999 }));
    expect(res.status).toBe(200);
    // 写操作的作用对象必须是自己的绑定行 100，而不是请求体里的 999999
    expect(poolExecute.mock.calls[0][1]).toEqual([42, 100]);
    expect(poolExecute.mock.calls[2][1]).toEqual([100]);
  });

  it("限流命中 → 直接返回限流响应，不碰数据库", async () => {
    vi.mocked(getContext).mockReturnValue(buildCtx(null).ctx as never);
    vi.mocked(checkRateLimit).mockReturnValue(
      NextResponse.json({ code: 42900, message: "操作过于频繁" }, { status: 429 }) as never,
    );

    const res = await POST(withdrawReq());
    expect(res.status).toBe(429);
    expect(poolExecute).not.toHaveBeenCalled();
  });
});
