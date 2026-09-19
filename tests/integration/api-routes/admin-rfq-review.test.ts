/**
 * 管理端 RFQ 审核接口集成测试（P0-4）
 * @module tests/integration/api-routes/admin-rfq-review.test.ts
 * @description 覆盖 fail-closed 鉴权（缺 token / 错 token / 未配置环境变量 → 403）
 *              与审核成功/未命中路径。Mock DB Pool，真实执行 route + service。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({ execute: poolExecute, query: vi.fn().mockResolvedValue([[]]) }),
}));

const TOKEN = "test-admin-token";

function req(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["x-admin-review-token"] = token;
  return new NextRequest("http://localhost:3000/api/admin/rfq/review", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function call(body: unknown, token?: string) {
  const { POST } = await import("@/app/api/admin/rfq/review/route");
  return POST(req(body, token));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_REVIEW_TOKEN = TOKEN;
  poolExecute.mockResolvedValue([{ affectedRows: 1 }]);
});
afterEach(() => {
  delete process.env.ADMIN_REVIEW_TOKEN;
});

describe("POST /api/admin/rfq/review", () => {
  it("缺少 token → 403", async () => {
    const res = await call({ rfqId: 10, decision: "approve" });
    expect(res.status).toBe(403);
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("错误 token → 403", async () => {
    const res = await call({ rfqId: 10, decision: "approve" }, "wrong");
    expect(res.status).toBe(403);
  });

  it("环境变量未配置 → fail-closed 403（即便带 token）", async () => {
    delete process.env.ADMIN_REVIEW_TOKEN;
    const res = await call({ rfqId: 10, decision: "approve" }, TOKEN);
    expect(res.status).toBe(403);
  });

  it("合法 token + approve → 200，执行更新", async () => {
    const res = await call({ rfqId: 10, decision: "approve" }, TOKEN);
    expect(res.status).toBe(200);
    expect(poolExecute).toHaveBeenCalledTimes(1);
    expect(poolExecute.mock.calls[0][1][0]).toBe("published");
  });

  it("审核目标非待审核 → 404", async () => {
    poolExecute.mockResolvedValue([{ affectedRows: 0 }]);
    const res = await call({ rfqId: 10, decision: "approve" }, TOKEN);
    expect(res.status).toBe(404);
  });

  it("非法 body（decision 非枚举）→ 400", async () => {
    const res = await call({ rfqId: 10, decision: "publish" }, TOKEN);
    expect(res.status).toBe(400);
  });
});
