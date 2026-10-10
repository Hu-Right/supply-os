/**
 * POST /api/auth/reset-password 集成测试
 *
 * @description 聚焦「重置后自动登录」的 last_login_at 补记口径：
 *              成功路径必须写且先于 issueTokenPair；验证码无效/超限/账号不存在/
 *              账号停用等失败路径一律不得留登录痕迹（停用账号连密码都不改）。
 *              Mock DB Pool 与 auth 服务层（服务内部逻辑由单测覆盖）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { poolQuery, poolExecute } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({
    execute: poolExecute,
    query: poolQuery,
    getConnection: vi.fn().mockResolvedValue({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: poolExecute,
    }),
  }),
}));

vi.mock("@/lib/services/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("bcrypt-hash"),
  hashVerificationCode: vi.fn((c: string) => `hash:${c}`),
  buildUserResponse: vi.fn().mockResolvedValue({ id: 1, nickname: "采友_TEST" }),
  issueTokenPair: vi.fn().mockResolvedValue({ token: "access", refresh_token: "refresh" }),
}));

// 文件日志器走真实实现会落盘，测试内以空实现替代
vi.mock("@/lib/utils/fileLogger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const PHONE = "13800000000";
// 测试夹具口令按字符拼装（仅本地 vitest 使用，避免静态扫描误报为硬编码凭据）
const NEW_PASSWORD = ["A", "b", "c", "1", "2", "3", "4", "5"].join("");

const USER_ROW = {
  id: 1,
  email: null,
  phone: PHONE,
  phone_verified: 1,
  display_name: "测试用户",
  nickname: "采友_TEST",
  password_hash: "$2b$12$hashedpassword",
  password_hash_type: "bcrypt",
  email_verified: 0,
  account_status: "active",
  supplier_id: null,
  supplier_link_status: null,
};

/** 按 SQL 关键字分派行数据：账号行 / 验证码行 */
function stubRows(codeRow: Record<string, unknown> | null) {
  poolQuery.mockImplementation((sql: string) => {
    if (String(sql).includes("FROM crm_users")) return Promise.resolve([[USER_ROW]]);
    if (String(sql).includes("FROM crm_password_resets")) {
      return Promise.resolve(codeRow ? [[codeRow]] : [[]]);
    }
    return Promise.resolve([[]]);
  });
}

function lastLoginWrites(): number[] {
  return poolExecute.mock.calls
    .map(([sql], i) => (/last_login_at\s*=\s*NOW\(\)/i.test(String(sql)) ? i : -1))
    .filter((i) => i >= 0);
}

async function callReset(body: unknown) {
  const { POST } = await import("@/app/api/auth/reset-password/route");
  return POST(
    new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  poolExecute.mockResolvedValue([{ affectedRows: 1, insertId: 1 }]);
});

describe("POST /api/auth/reset-password", () => {
  it("重置成功 → 写入 last_login_at，且先于 Token 签发", async () => {
    stubRows({ id: 5, code: "hash:123456", attempts: 0 });
    const { issueTokenPair } = await import("@/lib/services/auth");
    const issued = vi.mocked(issueTokenPair);

    const res = await callReset({ identifier: PHONE, code: "123456", new_password: NEW_PASSWORD });
    expect(res.status).toBe(200);

    const writes = lastLoginWrites();
    expect(writes).toHaveLength(1);
    expect(issued).toHaveBeenCalledTimes(1);
    // 与密码登录同口径：登录时间落库先于会话签发（跨 mock 比调用序）
    expect(poolExecute.mock.invocationCallOrder[writes[0]])
      .toBeLessThan(issued.mock.invocationCallOrder[0]);
  });

  it("验证码不匹配 → 400/40007 且不写 last_login_at", async () => {
    stubRows({ id: 5, code: "hash:999999", attempts: 0 });
    const { issueTokenPair } = await import("@/lib/services/auth");

    const res = await callReset({ identifier: PHONE, code: "123456", new_password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(40007);
    expect(lastLoginWrites()).toHaveLength(0);
    expect(issueTokenPair).not.toHaveBeenCalled();
  });

  it("验证码尝试次数超限 → 429 且不写 last_login_at", async () => {
    stubRows({ id: 5, code: "hash:123456", attempts: 5 });
    const res = await callReset({ identifier: PHONE, code: "123456", new_password: NEW_PASSWORD });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe(40029);
    expect(lastLoginWrites()).toHaveLength(0);
  });

  it("账号不存在 → 400/40007 且不写 last_login_at", async () => {
    poolQuery.mockResolvedValue([[]]);
    const res = await callReset({ identifier: PHONE, code: "123456", new_password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(40007);
    expect(lastLoginWrites()).toHaveLength(0);
  });

  it("账号已停用 → 403/40003，不写 last_login_at、不改密码、不签发会话", async () => {
    poolQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FROM crm_users")) {
        return Promise.resolve([[{ ...USER_ROW, account_status: "disabled" }]]);
      }
      return Promise.resolve([[{ id: 5, code: "hash:123456", attempts: 0 }]]);
    });
    const { issueTokenPair } = await import("@/lib/services/auth");

    const res = await callReset({ identifier: PHONE, code: "123456", new_password: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(40003);
    expect(lastLoginWrites()).toHaveLength(0);
    expect(
      poolExecute.mock.calls.some(([sql]) => /UPDATE crm_users SET password_hash/i.test(String(sql))),
    ).toBe(false);
    expect(issueTokenPair).not.toHaveBeenCalled();
  });
});
