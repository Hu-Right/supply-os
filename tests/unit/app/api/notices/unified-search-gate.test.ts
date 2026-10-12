/**
 * unified-search 路由门控测试（spec §3.3 有权益 / 无权益 / 匿名 三态契约）
 *
 * 隔离边界：auth / 限流 / DB 池 / context（权益仓储）/ 编排器全部 vi.mock，
 * 直接调用路由导出的 GET，走真实 withRoute + NextRequest + 纯函数解析链。
 * 验证：有权益透传（无标志）、无权益剥离降级（advanced_degraded: true）、
 * 匿名恒按 free 口径且不触权益查询、q 无高级语法时不发权益查询（前置短路）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  extractUserKey: vi.fn(),
  checkRateLimit: vi.fn(),
  isEntitled: vi.fn(),
  searchUnified: vi.fn(),
  findActivePlan: vi.fn(),
  resolveProfile: vi.fn(),
  l1NodesOfGroup: vi.fn(),
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
// 只换掉「大类 → L1 节点码」的取数（本用例组要的是注入行为，不是真树）：
// 其余导出原样透传，params.ts 依赖同模块的 isCommodityNodeKey 不能缺
vi.mock("@/lib/services/commodity/tree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/commodity/tree")>()),
  l1NodesOfGroup: mocks.l1NodesOfGroup,
}));
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
  // 默认无生效订阅 → 行业墙不启动（墙注入行为由专属用例覆盖）
  mocks.findActivePlan.mockResolvedValue(null);
  // 默认大类→L1 映射可用（墙的具体取值由专属用例覆写）
  mocks.l1NodesOfGroup.mockResolvedValue(["UGT-B-85"]);
});

function makeReq(url = URL_WITH_EXCLUDE) {
  return new NextRequest(url);
}

function expectUnifiedCalledOnceWithQ(q: string) {
  expect(mocks.searchUnified).toHaveBeenCalledTimes(1);
  expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ q });
}

describe("unified-search 高级语法档位门控（路由级）", () => {
  it("有权益：排除语法透传，无 advanced_degraded 标志", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.isEntitled.mockResolvedValue(true);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).toHaveBeenCalledWith(7, "advanced_keyword_search");
    expectUnifiedCalledOnceWithQ("solar -battery");
    expect(body.page_size).toBe(10);
    expect(body).not.toHaveProperty("advanced_degraded");
  });

  it("无权益：排除词剥离降级，advanced_degraded: true", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.isEntitled.mockResolvedValue(false);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).toHaveBeenCalledWith(7, "advanced_keyword_search");
    expectUnifiedCalledOnceWithQ("solar");
    expect(body.advanced_degraded).toBe(true);
  });

  it("匿名：恒按 free 口径降级，权益查询不触库", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 0, authViaJwt: false });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).not.toHaveBeenCalled();
    expectUnifiedCalledOnceWithQ("solar");
    expect(body.advanced_degraded).toBe(true);
  });

  it("普通多词（无高级语法）：登录用户也不发权益查询，原样透传无标志", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });

    const res = await GET(makeReq("http://localhost:3000/api/notices/unified-search?q=solar%20panel&page=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.isEntitled).not.toHaveBeenCalled();
    expectUnifiedCalledOnceWithQ("solar panel");
    expect(body).not.toHaveProperty("advanced_degraded");
  });

  it("行业墙：被限定档位用户注入 wall.nodes，recommended 收编进 prefs 管道", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue({ plan_code: "business" });
    // industry_scoped=1（business）、all_category_access=0（非演示档）
    mocks.isEntitled.mockImplementation(async (_uid: number, code: string) => code === "industry_scoped");
    // 墙只认 prefs.group_code（旧字典 level=1 是 A..J 十个容器，比大类粗到不能当行业口径）
    mocks.resolveProfile.mockResolvedValue({ userId: 7, groupCode: "UGT-G-25", levelIds: [109, null, null, null, 100852] });
    mocks.l1NodesOfGroup.mockResolvedValue(["UGT-B-85"]);

    const res = await GET(makeReq("http://localhost:3000/api/notices/unified-search?mode=recommended&page=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.searchUnified).toHaveBeenCalledTimes(1);
    expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ mode: "prefs", wall: { nodes: ["UGT-B-85"] } });
    expect(mocks.l1NodesOfGroup).toHaveBeenCalledWith(expect.anything(), "UGT-G-25");
    expect(body.needs_industry_selection).toBeUndefined();
  });

  it("行业墙：大类在库里挂不上 L1 → 仍注入空 wall（给空结果而不是放开全量）", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue({ plan_code: "business" });
    mocks.isEntitled.mockImplementation(async (_uid: number, code: string) => code === "industry_scoped");
    mocks.resolveProfile.mockResolvedValue({ userId: 7, groupCode: "UGT-G-25" });
    mocks.l1NodesOfGroup.mockResolvedValue([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(mocks.searchUnified.mock.calls[0][1]).toMatchObject({ wall: { nodes: [] } });
    warn.mockRestore();
  });

  it("行业墙：被限定档位未绑大类 → 不注入 wall，带 needs_industry_selection 引导标志", async () => {
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findActivePlan.mockResolvedValue({ plan_code: "business" });
    mocks.isEntitled.mockImplementation(async (_uid: number, code: string) => code === "industry_scoped");
    mocks.resolveProfile.mockResolvedValue(null);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.searchUnified.mock.calls[0][1]).not.toHaveProperty("wall");
    expect(body.needs_industry_selection).toBe(true);
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
