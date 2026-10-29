/**
 * /api/user/industry-prefs 集成测试 — 响应键命名红线（红线②【丙】组收口）
 *
 * @description GET 出口是 `json({ prefs: row })`：外层键看得见，UserIndustryPrefsRow 内部的
 *              `commodity_code` / `updated_at` 看不见（规则三登记的正是这个形状，真库探针实测两键全 snake）。
 *              这里用假仓储跑通路由，钉住两件事：
 *              ① 响应实体字段必须 camelCase（且 DB 列名不外泄）；
 *              ② 请求参数口径不变——POST 仍以 snake `commodity_code` 入参（红线②只约束响应实体字段）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

// 偏好缓存失效是另一条链的副作用，本测试只关心 wire 形状，掐掉它
const invalidateProfileCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/industry-profile/resolve", () => ({
  invalidateProfileCache,
}));

const PREFS_ROW = { commodity_code: "UGT-A01-B02", updated_at: new Date("2026-10-29T08:00:00Z") };

const deleteIndustryPrefs = vi.fn(async () => {});
const upsertIndustryPrefs = vi.fn(async () => {});
let prefsResult: unknown = PREFS_ROW;

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    user: { userPrefsRepo: { getIndustryPrefs: async () => prefsResult, deleteIndustryPrefs, upsertIndustryPrefs } },
  }),
}));

/** 响应里出现带下划线的键 = 违反红线②（分页/元数据白名单里不含本端点任何键） */
const snakeKeys = (obj: unknown): string[] =>
  Object.keys(obj as object).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));

function getReq(): NextRequest {
  return new NextRequest("http://localhost:3000/api/user/industry-prefs", { method: "GET" });
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/user/industry-prefs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  prefsResult = PREFS_ROW;
  deleteIndustryPrefs.mockClear();
  upsertIndustryPrefs.mockClear();
});

describe("GET /api/user/industry-prefs", () => {
  it("prefs 两键必须 camelCase，DB 列名不外泄", async () => {
    const { GET } = await import("@/app/api/user/industry-prefs/route");
    const res = await GET(getReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ prefs: { commodityCode: "UGT-A01-B02", updatedAt: "2026-10-29T08:00:00.000Z" } });
    expect(snakeKeys(body.prefs)).toEqual([]);
  });

  it("无偏好时 prefs 恒为 null，且顶层不出现 snake 键", async () => {
    prefsResult = null;
    const { GET } = await import("@/app/api/user/industry-prefs/route");
    const body = await (await GET(getReq())).json();

    expect(body).toEqual({ prefs: null });
    expect(snakeKeys(body)).toEqual([]);
  });
});

describe("POST /api/user/industry-prefs", () => {
  it("请求参数仍是 snake commodity_code：传空即清除偏好（口径与响应侧不同，不得顺手改成 camel）", async () => {
    const { POST } = await import("@/app/api/user/industry-prefs/route");
    const res = await POST(postReq({ commodity_code: null }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteIndustryPrefs).toHaveBeenCalledWith(7);
    expect(upsertIndustryPrefs).not.toHaveBeenCalled();
  });
});
