/**
 * CRM 排队状态端点的 wire 键集合断言（命名红线② C 组收敛）。
 *
 * 这条登记项原本停在 C「尚未实测」，理由是库里没有 waiting 会话行、只读探针拿不到响应。
 * 但排队状态其实不需要真库：路由出口就是两个字面量出口
 * （非 waiting 走 `{ position: 0, agentsOnline: 0, avgAcceptSeconds: null, status }`，
 * waiting 走 `{ ...info, status }`，info 由 chatRepo.getQueueInfo 显式列字段返回），
 * 所以用假 repo 跑路由就能把「看不见」直接钉成断言——比等一条现网数据更便宜也更稳。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findSessionById: vi.fn(),
  getQueueInfo: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
  sessionOwnedBy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ chatRepo: { findSessionById: mocks.findSessionById, getQueueInfo: mocks.getQueueInfo } }),
}));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: mocks.requireUserKeyOrThrow }));
vi.mock("@/lib/services/chat-service", () => ({ sessionOwnedBy: mocks.sessionOwnedBy }));

import { GET } from "@/app/api/crm/chat/sessions/queue/route";
import { ChatRepo } from "@/lib/repos/chat.repo";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const req = () => new NextRequest("http://localhost:3000/api/crm/chat/sessions/queue?sessionId=5");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKeyOrThrow.mockResolvedValue({ userId: 7 });
  mocks.sessionOwnedBy.mockReturnValue(true);
});

describe("GET /api/crm/chat/sessions/queue", () => {
  it("waiting 会话：整块透出的 info 只有三个 camel 键 + status", async () => {
    mocks.findSessionById.mockResolvedValue({ id: 5, status: "waiting" });
    // repo 的 SQL 别名是 ahead/total/avg_seconds；出口必须是映射后的 camel 键
    mocks.getQueueInfo.mockResolvedValue({ position: 2, agentsOnline: 3, avgAcceptSeconds: 45 });

    const body = await (await GET(req(), {} as never)).json();
    expect(body).toEqual({ position: 2, agentsOnline: 3, avgAcceptSeconds: 45, status: "waiting" });
    expect([...Object.keys(body)].sort()).toEqual(["agentsOnline", "avgAcceptSeconds", "position", "status"]);
    expect(Object.keys(body).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("非 waiting 会话：空态出口键集合与 waiting 完全一致（前端可无差别轮询）", async () => {
    mocks.findSessionById.mockResolvedValue({ id: 5, status: "active" });

    const body = await (await GET(req(), {} as never)).json();
    expect([...Object.keys(body)].sort()).toEqual(["agentsOnline", "avgAcceptSeconds", "position", "status"]);
    expect(body.status).toBe("active");
    expect(Object.keys(body).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    expect(mocks.getQueueInfo).not.toHaveBeenCalled();
  });

  it("avgAcceptSeconds 允许为 null（无历史接单样本），但不得改成缺键或 snake 名", async () => {
    mocks.findSessionById.mockResolvedValue({ id: 5, status: "waiting" });
    mocks.getQueueInfo.mockResolvedValue({ position: 0, agentsOnline: 0, avgAcceptSeconds: null });

    const body = await (await GET(req(), {} as never)).json();
    expect("avgAcceptSeconds" in body).toBe(true);
    expect(body.avgAcceptSeconds).toBeNull();
  });
});

// 上面用假 repo 只能证「路由不额外漏键」；真正会漏 snake 的地方在这里——
// SQL 别名是 ahead / total / avg_seconds，必须在 repo 出口就映射成 camel，不能带上网。
describe("ChatRepo.getQueueInfo：SQL 别名 → camel 键", () => {
  const fakePool = (rows: { ahead?: number; total?: number; avg_seconds?: number | null }[]) => ({
    execute: vi.fn(async () => [rows.map((r) => ({ ahead: r.ahead ?? 0 }))]),
    query: vi
      .fn()
      .mockResolvedValueOnce([rows.map((r) => ({ total: r.total ?? 0 }))])
      .mockResolvedValueOnce([rows.map((r) => ({ avg_seconds: r.avg_seconds ?? null }))]),
  });

  it("三个聚合别名不会原名上网，position 含自己（ahead+1）", async () => {
    const info = await new ChatRepo(fakePool([{ ahead: 2, total: 3, avg_seconds: 45.4 }]) as never).getQueueInfo(5);
    expect(info).toEqual({ position: 3, agentsOnline: 3, avgAcceptSeconds: 45 });
    expect(Object.keys(info).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("无历史接单样本时 avg_seconds=NULL → avgAcceptSeconds=null（不造 0，也不漏键）", async () => {
    const info = await new ChatRepo(fakePool([{ ahead: 0, total: 0, avg_seconds: null }]) as never).getQueueInfo(5);
    expect(info).toEqual({ position: 1, agentsOnline: 0, avgAcceptSeconds: null });
  });
});
