/**
 * 客服会话端点响应键红线（命名红线②）
 *
 * @description /api/crm/chat/sessions 的三个出口（GET 列表 / POST 复用回显 / GET 新建回显）
 *              与 /sessions/history 都是「repo 行过 mapper 后整块 json 出去」，
 *              静态门禁只看得见 route.ts 里的字面量键，看不见这种形态——所以键名必须由断言守住。
 *              这里用真实 mapper + 假 repo 跑通路由，断言 wire 上：
 *              1) 键全为 camelCase；2) DB 列名与内部标识列（user_id/customer_id/agent_id/
 *                 lead_id/assigned_*）不外泄；3) 列表与单条回显同一命名（不分裂）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SNAKE_KEY = /[a-z0-9]_[a-z0-9]/;

/** 递归收集对象里所有键（含嵌套），用于「整棵树都不该有 snake 键」的断言 */
function allKeys(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) allKeys(item, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}

const expectNoSnakeKeys = (payload: unknown, where: string) => {
  const bad = [...new Set(allKeys(payload).filter((k) => SNAKE_KEY.test(k)))];
  expect(bad, `${where} 泄漏 DB 列名`).toEqual([]);
};

const mocks = vi.hoisted(() => ({
  listSessionsByCustomer: vi.fn(),
  findSessionById: vi.fn(),
  createSession: vi.fn(),
  listHistorySessions: vi.fn(),
  requireUserKey: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    chatRepo: {
      listSessionsByCustomer: mocks.listSessionsByCustomer,
      findSessionById: mocks.findSessionById,
      createSession: mocks.createSession,
      listHistorySessions: mocks.listHistorySessions,
    },
  }),
}));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: mocks.requireUserKey }));
// 限流器会落盘计数文件，路由测试只关心它放行
vi.mock("@/lib/middleware/rateLimiter", () => ({
  checkRateLimit: () => undefined,
  getRateLimitPersistDir: () => ".",
}));

import { GET as listGET, POST as createPOST } from "@/app/api/crm/chat/sessions/route";
import { GET as historyGET } from "@/app/api/crm/chat/sessions/history/route";

const req = (qs = "") => new NextRequest(`http://localhost:3000/api/crm/chat/sessions${qs}`);
/** POST 体：直传字面量，不抽 RequestInit 变量（Next 的 init 类型与 DOM 的不同） */
const postReq = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/crm/chat/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });

/** SELECT * 出来的会话行：既含对外列，也含不该出网的内部标识列 */
const SESSION_ROW = {
  id: 42,
  user_id: 7,
  customer_id: "legacy-credential",
  customer_name: "张三",
  lead_id: "L-9",
  agent_id: "agent-internal-1",
  agent_email: "support@example.com",
  status: "active",
  mode: "human",
  ai_handled_count: 3,
  locale: "zh",
  ai_summary: "客户询问交付周期",
  created_at: new Date("2026-10-27T01:00:00.000Z"),
  accepted_at: new Date("2026-10-27T01:05:00.000Z"),
  closed_at: null,
  last_message_at: new Date("2026-10-27T01:10:00.000Z"),
  satisfaction: null,
  satisfaction_tag: null,
  satisfaction_comment: null,
  rated_at: null,
  // 库里真实存在、但 TS 行类型未声明的列：SELECT * 会把它们带上，视图必须挡掉
  assigned_uid: 88,
  assigned_at: new Date("2026-10-27T01:05:00.000Z"),
};

const HISTORY_ROW = {
  id: 41,
  agent_email: "support@example.com",
  status: "closed",
  mode: "human",
  locale: "zh",
  ai_summary: "已解决",
  created_at: new Date("2026-10-26T01:00:00.000Z"),
  accepted_at: new Date("2026-10-26T01:03:00.000Z"),
  closed_at: new Date("2026-10-26T02:00:00.000Z"),
  satisfaction: 5,
  last_message: "谢谢",
  message_count: 9,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
  mocks.listSessionsByCustomer.mockResolvedValue([SESSION_ROW]);
  mocks.findSessionById.mockResolvedValue(SESSION_ROW);
  mocks.createSession.mockResolvedValue(42);
  mocks.listHistorySessions.mockResolvedValue([HISTORY_ROW]);
});

describe("GET /api/crm/chat/sessions — 会话列表契约", () => {
  it("响应键全 camelCase，DB 列名与内部标识列都不出网", async () => {
    const body = await (await listGET(req())).json();

    expect(Array.isArray(body)).toBeTruthy();
    expectNoSnakeKeys(body, "GET /sessions");
    for (const leaked of ["user_id", "customer_id", "agent_id", "lead_id", "assigned_uid", "assigned_at"]) {
      expect(body[0]).not.toHaveProperty(leaked);
    }
    // 值语义不变：客服署名取自 agent_email 列，但键名不再是列名
    expect(body[0].agentName).toBe("support@example.com");
    expect(body[0].customerName).toBe("张三");
    expect(body[0].aiHandledCount).toBe(3);
    expect(body[0].id).toBe(42);
  });

  it("时间是 ISO 串且序列化后不丢信息（值原样透传，不改格式）", async () => {
    const body = await (await listGET(req())).json();
    expect(body[0].createdAt).toBe("2026-10-27T01:00:00.000Z");
    expect(body[0].acceptedAt).toBe("2026-10-27T01:05:00.000Z");
    expect(body[0].closedAt).toBeNull();
    expect(body[0].lastMessageAt).toBe("2026-10-27T01:10:00.000Z");
  });
});

describe("POST /api/crm/chat/sessions — 回显与列表同一命名", () => {
  it("复用既有会话时，回显键名与 GET 列表完全一致（不能一个 camel 一个 snake）", async () => {
    const res = await createPOST(postReq({ customerName: "张三" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expectNoSnakeKeys(body, "POST /sessions（复用分支）");
    const listBody = await (await listGET(req())).json();
    expect(Object.keys(body).sort()).toEqual(Object.keys(listBody[0]).sort());
  });

  it("新建分支回显同样走视图，201 且不泄漏内部列", async () => {
    mocks.listSessionsByCustomer.mockResolvedValue([]);
    const res = await createPOST(postReq({ customerName: "张三", locale: "zh" }));
    expect(res.status).toBe(201);
    const body = await res.json();

    expectNoSnakeKeys(body, "POST /sessions（新建分支）");
    expect(body.agentName).toBe("support@example.com");
    expect(body).not.toHaveProperty("agent_email");
  });

  it("回查不到新建行时返回 null 而不是半成品对象", async () => {
    mocks.listSessionsByCustomer.mockResolvedValue([]);
    mocks.findSessionById.mockResolvedValue(null);
    const res = await createPOST(postReq({ customerName: "张三" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toBeNull();
  });
});

describe("GET /api/crm/chat/sessions/history — 历史会话契约", () => {
  it("sessions 元素键全 camelCase（含两个子查询列 last_message/message_count 归位）", async () => {
    const body = await (await historyGET(req("?limit=5&offset=0"))).json();

    expectNoSnakeKeys(body, "GET /sessions/history");
    expect(body.limit).toBe(5);
    expect(body.offset).toBe(0);
    expect(body.sessions[0].lastMessage).toBe("谢谢");
    expect(body.sessions[0].messageCount).toBe(9);
    expect(body.sessions[0].agentName).toBe("support@example.com");
    expect(body.sessions[0].satisfaction).toBe(5);
  });
});
