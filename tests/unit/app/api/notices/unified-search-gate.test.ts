/**
 * unified-search 路由门控测试（spec §3.3 有权益 / 无权益 / 匿名 三态契约）
 *
 * 隔离边界：auth / 限流 / DB 池 / context（权益仓储）/ 编排器全部 vi.mock，
 * 直接调用路由导出的 GET，走真实 withRoute + NextRequest + 纯函数解析链。
 * 验证：有权益透传（无标志）、无权益剥离降级（advancedDegraded: true）、
 * 匿名恒按 free 口径且不触权益查询、q 无高级语法时不发权益查询（前置短路）。
 * 另一组钉住响应信封的键集合（命名红线②：路由已从 `json({ ...result })` 收为显式列举）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  extractUserKey: vi.fn(),
  checkRateLimit: vi.fn(),
  isEntitled: vi.fn(),
  loadCells: vi.fn(),
  searchUnified: vi.fn(),
  findActivePlan: vi.fn(),
  resolveProfile: vi.fn(),
  logSearch: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({
  extractUserKey: mocks.extractUserKey,
}));
vi.mock("@/lib/middleware/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({}),
}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    benefitSystemRepo: {
      isEntitled: mocks.isEntitled,
      findActivePlanForUser: mocks.findActivePlan,
      // 2026-10-28 free 化：行业墙一次 loadCells 取齐同列两格（industry_scoped/all_category_access）
      loadCells: mocks.loadCells,
    },
    notice: {
      feedbackRepo: { logSearch: mocks.logSearch },
    },
  }),
}));
vi.mock("@/lib/services/industry-profile/resolve", () => ({
  resolveUserIndustryProfile: mocks.resolveProfile,
  invalidateProfileCache: vi.fn(),
}));
// 2026-10-15 G 码退役：大类由偏好 commodity_code 前缀纯切片推导（tree 的纯函数），
// 不再有「大类 → L1 节点码」的取数口可 mock，本文件不再需要动 commodity/tree。
vi.mock("@/lib/services/search-orchestrator", () => ({
  searchUnified: mocks.searchUnified,
}));

import { GET } from "@/app/api/notices/unified-search/route";

const URL_WITH_EXCLUDE = "http://localhost:3000/api/notices/unified-search?q=solar%20-battery&page=1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockReturnValue(null);
  mocks.searchUnified.mockResolvedValue({ items: [], total: 0, pageSize: 10 });
  mocks.logSearch.mockResolvedValue(undefined);
  // 默认无生效订阅 → free 列无行业墙格子 → 行业墙不启动（墙注入行为由专属用例覆盖）
  mocks.findActivePlan.mockResolvedValue(null);
  mocks.loadCells.mockResolvedValue([]);
});

/** 行业墙列格子：industry_scoped=1、all_category_access 可选（演示档旁路） */
const wallCells = (bypass = false) => [
  { plan_code: "business", benefit_code: "industry_scoped", value_level: 1 },
  ...(bypass ? [{ plan_code: "business", benefit_code: "all_category_access", value_level: 1 }] : []),
];

function makeReq(url = URL_WITH_EXCLUDE) {
  return new NextRequest(url);
}

function expectUnifiedCalledOnceWithQ(q: string) {
  expect(mocks.searchUnified).toHaveBeenCalledTimes(1);
  expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ q });
}

describe("unified-search 高级语法档位门控（路由级）", () => {
  it("有权益：排除语法透传，无 advancedDegraded 标志", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.isEntitled.mockResolvedValue(true);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).toHaveBeenCalledWith(7, "advanced_keyword_search");
    expectUnifiedCalledOnceWithQ("solar -battery");
    expect(body.page_size).toBe(10);
    expect(body).not.toHaveProperty("advancedDegraded");
  });

  it("无权益：排除词剥离降级，advancedDegraded: true", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.isEntitled.mockResolvedValue(false);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).toHaveBeenCalledWith(7, "advanced_keyword_search");
    expectUnifiedCalledOnceWithQ("solar");
    expect(body.advancedDegraded).toBe(true);
  });

  it("匿名：恒按 free 口径降级，权益查询不触库", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 0, authViaJwt: false });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).not.toHaveBeenCalled();
    expectUnifiedCalledOnceWithQ("solar");
    expect(body.advancedDegraded).toBe(true);
  });

  it("普通多词（无高级语法）：登录用户也不发权益查询，原样透传无标志", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });

    const res = await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar%20panel&page=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).not.toHaveBeenCalled();
    expectUnifiedCalledOnceWithQ("solar panel");
    expect(body).not.toHaveProperty("advancedDegraded");
  });

  it("行业墙：被限定档位用户注入 wall.nodes，recommended 收编进 prefs 管道", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue({ plan_code: "business" });
    // 行业墙列：industry_scoped=1、all_category_access=0（非演示档）；isEntitled 只服务高级语法门控
    mocks.loadCells.mockResolvedValue(wallCells());
    // 墙键 = 偏好 commodity_code 的 L1 前缀（2026-10-15 G 码退役，纯切片推导、零查库）
    mocks.resolveProfile.mockResolvedValue({ userId: 7, commodityCode: "UGT-85010101" });

    const res = await GET(makeReq("http://localhost:3000/api/notices/unified-search?mode=recommended&page=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.searchUnified).toHaveBeenCalledTimes(1);
    expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ mode: "prefs", wall: { nodes: ["UGT-85"] } });
    expect(body.needsIndustrySelection).toBeUndefined();
  });

  it("行业墙：偏好码推导不出大类 → 仍注入空 wall（给空结果而不是放开全量）", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue({ plan_code: "business" });
    mocks.loadCells.mockResolvedValue(wallCells());
    mocks.resolveProfile.mockResolvedValue({ userId: 7, commodityCode: "UGT-XY" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ wall: { nodes: [] } });
    warn.mockRestore();
  });

  it("行业墙：被限定档位未绑大类 → 不注入 wall，带 needsIndustrySelection 引导标志", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue({ plan_code: "business" });
    mocks.loadCells.mockResolvedValue(wallCells());
    mocks.resolveProfile.mockResolvedValue(null);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.searchUnified.mock.calls[0][1]).not.toHaveProperty("wall");
    expect(body.needsIndustrySelection).toBe(true);
  });

  it("行业墙 free 化：无订阅但 free 列 industry_scoped=1 → 同样注入 wall", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue(null);
    mocks.loadCells.mockResolvedValue(wallCells());
    mocks.resolveProfile.mockResolvedValue({ userId: 7, commodityCode: "UGT-85010101" });

    const res = await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar&page=1"));

    expect(res.status).toBe(200);
    expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ wall: { nodes: ["UGT-85"] } });
  });

  it("搜索日志：登录用户带词检索落库（记录实际执行的 q 与结果总数）", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.searchUnified.mockResolvedValue({ items: [], total: 42, pageSize: 10 });

    await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar&country=CN&budget_min=5000&match_mode=any&page=2"));

    expect(mocks.logSearch).toHaveBeenCalledTimes(1);
    const [uid, q, country, filters, total] = mocks.logSearch.mock.calls[0];
    expect(uid).toBe(7);
    expect(q).toBe("solar");
    expect(country).toBe("CN");
    expect(JSON.parse(filters)).toMatchObject({
      mode: "default",
      page: 2,
      budget_min: 5000,
      match_mode: "any",
      sort: "latest",
    });
    expect(total).toBe(42);
  });

  it("搜索日志：匿名检索与推荐模式空载均不落库", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 0, authViaJwt: false });
    await GET(makeReq());
    expect(mocks.logSearch).not.toHaveBeenCalled();

    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    await GET(makeReq("http://localhost:3000/api/notices/unified-search?mode=recommended&page=1"));
    expect(mocks.logSearch).not.toHaveBeenCalled();
  });
});

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

/**
 * 信封键集合钉（2026-10-28 红线② B 组收敛）。
 * 这一条登记项原先停在「路由整块透出，静态面看不见键」：`json({ ...result, … })` 把
 * UnifiedSearchResult 的任何字段直接顶成响应键，所以服务改一次、wire 就静默改一次。
 * 路由改成显式列举后，拿假编排器返回值就能把信封钉死——不需要真库、不需要打 Meili。
 */
describe("unified-search 响应信封（红线②：整块透出已收口）", () => {
  beforeEach(() => {
    mocks.extractUserKey.mockResolvedValue({ userId: 0, authViaJwt: false });
  });

  it("服务结果里的内部字段不得随信封上网；分页元数据只有 page_size，不留 camel 同值别名", async () => {
    mocks.searchUnified.mockResolvedValue({
      items: [], total: 7, page: 2, pageSize: 12,
      variant: "B", fallback: "mysql_degraded", matchRelaxed: true,
      // 编排器类型上随时可能多出来的内部字段（日志/耗时/策略）——示例两条，必须被信封挡住
      digest: "mode=default|q=solar", meiliMs: 12,
    });

    const body = await (await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar&page=2"))).json();

    expect(body).toEqual({
      items: [], total: 7, page: 2, page_size: 12,
      variant: "B", fallback: "mysql_degraded", matchRelaxed: true,
    });
    // spread 时代这里同时有 pageSize（服务字段名）与 page_size（元数据口径）——同值双名就是桥
    expect(body).not.toHaveProperty("pageSize");
    expect(Object.keys(body).filter((k) => SNAKE_KEY.test(k))).toEqual(["page_size"]);
  });

  it("未发生的状态不占键位：无 variant/fallback/matchRelaxed 时信封就只有四项", async () => {
    mocks.searchUnified.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    const body = await (await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar"))).json();

    expect([...Object.keys(body)].sort()).toEqual(["items", "page", "page_size", "total"]);
  });

  it("items 仍走行→视图：宽表列名在信封里已换成 camel 键（值原样）", async () => {
    mocks.searchUnified.mockResolvedValue({
      items: [{ notice_pk: 12345, notice_id: "UN-12345", title_zh: "标题", country_code: "CN", deadline_ts: 1700000000 }],
      total: 1, page: 1, pageSize: 10, fallback: "none",
    });

    const body = await (await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar"))).json();

    expect([...Object.keys(body.items[0])].sort()).toEqual([
      "countryCode", "deadlineTs", "noticeId", "noticePk", "titleZh",
    ]);
    expect(body.items[0].noticePk).toBe(12345);
    expect(Object.keys(body.items[0]).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });
});
