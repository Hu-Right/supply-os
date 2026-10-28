/**
 * 三个「解锁记录」端点的响应形状集成测试（红线② + 两个静默失效的回归锁）
 *
 * @description 覆盖 /api/payment/unlocks、/api/notices/unlocks、/api/opportunities/unlocks。
 *              三个端点历史上都把 repo 行整行透出，静态门禁看不见；其中两个还带着
 *              真实功能损坏：
 *              - /api/notices/unlocks 吐 notice_id，而客户端 fetchUnlockedNoticeIds 读
 *                noticeId → Number(undefined)=NaN 被过滤 → 已解锁集合恒空；
 *              - /api/opportunities/unlocks 不过滤 opportunity_id IS NULL，公告解锁行
 *                全带 null id 回来 → 列表实际不可用。
 *              这里同时断言 wire 形状与 SQL 过滤口径，防止改回去。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const recorded = vi.hoisted(() => ({ sqls: [] as string[] }));

/** 平铺的解锁行（DB 列形状），与 payment-history.repo 的 SELECT 结果一致 */
const PAYMENT_UNLOCK_ROW = {
  user_id: 7,
  notice_id: 1234,
  unlock_type: "subscription",
  price: 99,
  unlocked_at: new Date("2026-10-21T09:10:06Z"),
  external_notice_id: "GJ-2026-001",
  reference: "REF-1",
  title: "公告标题",
  notice_type: "tender",
  agency: "AHA",
  agency_full: "Agency Full",
  country: "Latvia",
  deadline: "2026-10-01",
  deadline_ts: Math.floor(Date.UTC(2026, 9, 1) / 1000), // 已过 → deadlineExpired=true
  url: "https://x/1",
  industry: "IT",
  description: "整段公告正文（不应外发）",
  title_i18n: "公告标题译文",
};

/** 公告解锁行（notice-unlock.repo） */
const NOTICE_UNLOCK_ROW = {
  notice_id: 4321,
  unlock_type: "single",
  unlocked_at: new Date("2026-10-20T01:02:03Z"),
};

/** 商机解锁行（opportunities.repo） */
const OPP_UNLOCK_ROW = {
  opportunity_id: 176,
  unlock_type: "subscription",
  unlocked_at: new Date("2026-10-19T01:02:03Z"),
};

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({
    query: async (sql: string) => {
      recorded.sqls.push(String(sql));
      if (sql.includes("opportunity_id")) return [ [OPP_UNLOCK_ROW] ];
      return [ [NOTICE_UNLOCK_ROW] ];
    },
  }),
}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

vi.mock("@/lib/db/context", async () => {
  const { OpportunitiesRepo } = await import("@/lib/repos/opportunities.repo");
  const pool = await import("@/lib/db/pool");
  const fakePool = (pool as { getPool: () => unknown }).getPool() as never;
  return {
    getContext: () => ({
      opportunitiesRepo: new OpportunitiesRepo(fakePool),
      payment: {
        paymentHistoryRepo: {
          countUnlocks: async () => 1,
          listUnlocks: async () => [PAYMENT_UNLOCK_ROW],
        },
      },
    }),
  };
});

const snakeKeys = (obj: unknown) =>
  Object.keys(obj as object).filter((k) => /_[a-z0-9]/.test(k));

function get(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method: "GET" });
}

beforeEach(() => {
  recorded.sqls.length = 0;
});

describe("GET /api/payment/unlocks", () => {
  it("平铺行 → 嵌套 camel；description/user_id 不外发；deadlineExpired 就地算出", async () => {
    const { GET } = await import("@/app/api/payment/unlocks/route");
    const body = await (await GET(get("/api/payment/unlocks?page=1&limit=3&lang=zh"))).json();

    expect(body).toMatchObject({ total: 1, page: 1, limit: 3 });
    const row = body.list[0];
    expect(Object.keys(row)).toEqual(["noticeId", "unlockType", "price", "unlockedAt", "notice"]);
    expect(snakeKeys(row.notice)).toEqual([]);
    expect(row.notice).toMatchObject({
      title: "公告标题",
      titleI18n: "公告标题译文",
      agencyFull: "Agency Full",
      country: "Latvia",
      deadlineExpired: true,
    });
    expect(JSON.stringify(body)).not.toContain("description");
    expect(JSON.stringify(body)).not.toContain("user_id");
  });
});

describe("GET /api/notices/unlocks", () => {
  it("响应体是 camel 视图，且 SQL 只取公告解锁行（客户端读的就是 noticeId，"
    + "曾经的 notice_id 让已解锁集合恒空）", async () => {
    const { GET } = await import("@/app/api/notices/unlocks/route");
    const rows = await (await GET(get("/api/notices/unlocks"))).json();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({ noticeId: 4321, unlockType: "single" });
    expect(snakeKeys(rows[0])).toEqual([]);
    expect(rows[0].unlockedAt).toBe(new Date("2026-10-20T01:02:03Z").toISOString());

    const sql = recorded.sqls.find((s) => s.includes("opportunity_unlocks"));
    expect(sql).toBeTruthy();
    expect(sql).toContain("notice_id IS NOT NULL");
  });
});

describe("GET /api/opportunities/unlocks", () => {
  it("响应体是 camel 视图（opportunityId），且 SQL 过滤掉公告解锁行", async () => {
    const { GET } = await import("@/app/api/opportunities/unlocks/route");
    const rows = await (await GET(get("/api/opportunities/unlocks"))).json();

    expect(rows[0]).toMatchObject({ opportunityId: 176, unlockType: "subscription" });
    expect(snakeKeys(rows[0])).toEqual([]);

    // 不过滤就会把公告解锁行也返出来（opportunity_id 为 NULL），列表实际不可用
    const sql = recorded.sqls.find((s) => s.includes("opportunity_id IS") || s.includes("SELECT opportunity_id"));
    expect(sql).toContain("opportunity_id IS NOT NULL");
  });
});
