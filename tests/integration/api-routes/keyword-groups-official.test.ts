/**
 * 官方精选词组只读端点 + 用户写路径保留名校验测试
 *
 * @description 基建照 tests/unit/api/user/enterprise-post-binding-guard.test.ts：
 *              直接 mock @/lib/db/context 返回假 repo，不打真库；路由内真实
 *              service/校验逻辑全走。覆盖 spec §3/§2.2：
 *              - GET /api/keyword-groups/official：公开、裸载荷 { groups }、camelCase
 *              - POST /api/user/keyword-groups：占用官方名 → 400 + 40068，不落库
 *              - PATCH /api/user/keyword-groups/:id：改名占用官方名 → 400 + 40068
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query: vi.fn(), execute: vi.fn() }) }));
vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: vi.fn(() => null) }));

import { GET as officialGET } from "@/app/api/keyword-groups/official/route";
import { POST as userPOST } from "@/app/api/user/keyword-groups/route";
import { PATCH as userPATCH } from "@/app/api/user/keyword-groups/[id]/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { EC_KEYWORD_GROUP_NAME_RESERVED } from "@/shared/constants/api";

const rows = [{ id: 1, name: "光伏", terms: ["光伏"], categoryCode: "energy", sortOrder: 0 }];

const makeCtx = (over: { officialReserved?: boolean } = {}) => {
  const ctx = {
    benefitSystemRepo: { isEntitled: vi.fn().mockResolvedValue(true) },
    officialKeywordGroupsRepo: {
      listEnabled: vi.fn().mockResolvedValue(rows),
      isOfficialName: vi.fn().mockResolvedValue(over.officialReserved ?? false),
    },
    user: {
      keywordGroupsRepo: {
        countByUser: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 7 }),
        update: vi.fn().mockResolvedValue(true),
      },
    },
  };
  return ctx;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
});

describe("GET /api/keyword-groups/official", () => {
  it("公开访问（无鉴权头）；200 裸载荷 { groups }，字段 camelCase", async () => {
    vi.mocked(getContext).mockReturnValue(makeCtx() as never);
    const res = await officialGET(new NextRequest("http://x/api/keyword-groups/official") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groups: rows });
    expect(requireUserKeyOrThrow).not.toHaveBeenCalled();
  });
});

describe("POST /api/user/keyword-groups 保留名", () => {
  it("官方名命中 → 400 + EC_KEYWORD_GROUP_NAME_RESERVED，不落库", async () => {
    const ctx = makeCtx({ officialReserved: true });
    vi.mocked(getContext).mockReturnValue(ctx as never);
    const req = new NextRequest("http://x/api/user/keyword-groups", {
      method: "POST",
      body: JSON.stringify({ name: "光伏", terms: ["a"] }),
    });
    const res = await userPOST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: EC_KEYWORD_GROUP_NAME_RESERVED });
    expect(ctx.user.keywordGroupsRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/user/keyword-groups/:id 改名保留名", () => {
  it("改名占用官方名 → 400 + EC_KEYWORD_GROUP_NAME_RESERVED，不触 update", async () => {
    const ctx = makeCtx({ officialReserved: true });
    vi.mocked(getContext).mockReturnValue(ctx as never);
    const req = new NextRequest("http://x/api/user/keyword-groups/5", {
      method: "PATCH",
      body: JSON.stringify({ name: "光伏" }),
    });
    const res = await userPATCH(req as never, { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: EC_KEYWORD_GROUP_NAME_RESERVED });
    expect(ctx.user.keywordGroupsRepo.update).not.toHaveBeenCalled();
  });
});
