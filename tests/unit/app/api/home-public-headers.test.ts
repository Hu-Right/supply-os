/**
 * 首页公开聚合端点的 HTTP 缓存头回归（2026-10 架构评审 P0-2 配套）
 *
 * /api/notices/stats 与 /api/notices/countries 是首页数字墙/世界地图的数据源，
 * 此前无 Cache-Control，浏览器层无法吸收多组件实例的重复拉取。
 * 与 hot-topics（public, max-age=600）对齐为同一口径；payload 行为不变。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  getNoticeStats: vi.fn(),
  getNoticeCountries: vi.fn(),
  getNoticeDailyNew: vi.fn(),
}));

vi.mock("@/lib/db/pool", () => ({ getPool: mocks.getPool }));
vi.mock("@/lib/services/notice-search", () => ({
  getNoticeStats: mocks.getNoticeStats,
  getNoticeCountries: mocks.getNoticeCountries,
  getNoticeDailyNew: mocks.getNoticeDailyNew,
}));

import { GET as statsGET } from "@/app/api/notices/stats/route";
import { GET as countriesGET } from "@/app/api/notices/countries/route";

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPool.mockReturnValue({
    query: vi.fn().mockResolvedValue([[{ total: 5 }]]),
  });
  mocks.getNoticeStats.mockResolvedValue({ active: 1000 });
  mocks.getNoticeCountries.mockResolvedValue([{ country: "CN", count: 9 }]);
  mocks.getNoticeDailyNew.mockResolvedValue({ todayNew: 7, yesterdayNew: 3 });
});

describe("GET /api/notices/stats", () => {
  it("返回 10 分钟公共缓存头；todayNew/yesterdayNew 由下沉后的 service 拼接（薄壳不回库）", async () => {
    const res = await statsGET(req("/api/notices/stats"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
    const body = await res.json();
    expect(body.active).toBe(1000);
    expect(body.todayNew).toBe(7);
    expect(body.yesterdayNew).toBe(3);
    // 路由层不再直接碰 pool（业务 SQL 已下沉 lib/services）
    expect(mocks.getPool().query).not.toHaveBeenCalled();
  });

  it("daily 查询失败时按历史行为降级为 0/0，不阻断主响应", async () => {
    mocks.getNoticeDailyNew.mockRejectedValue(new Error("db down"));
    const res = await statsGET(req("/api/notices/stats"));
    const body = await res.json();
    expect(body.todayNew).toBe(0);
    expect(body.yesterdayNew).toBe(0);
  });
});

describe("GET /api/notices/countries", () => {
  it("返回 10 分钟公共缓存头，国家计数数组原样下发", async () => {
    const res = await countriesGET(req("/api/notices/countries"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
    await expect(res.json()).resolves.toEqual([{ country: "CN", count: 9 }]);
  });
});
