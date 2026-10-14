/**
 * R3' B2：商机列表端点断掉 UNSPSC 字典依赖
 *
 * 判据出处：specs §4 第 1 行（退役 /api/opportunities GET 的 UNSPSC 入参 +
 * findUnspscCodeById/ByCode）。但**端点本身不删**，理由是本批实测：
 *   - 全 src/app/api 里只有这一个端点列商机（unified-search 不返回商机），
 *     删掉就是「商机列表」HTTP 能力归零，且连带删掉一条活着的安全断言
 *     （ARCH-P0：无认证不得拉全量、source_url 不得下发、description 截断）；
 *   - crm_bid_opportunities 上没有任何 backbone/UGT 列（实测只有 unspsc_codes:json），
 *     所以「换成 UGT 入参」在商机表上物理不成立。
 * 取「去掉 UNSPSC 过滤、保留有界列表」：listOpportunities 的 SQL 本来就带 LIMIT 80，
 * 且认证要求不变 ⇒ 数据暴露面不扩大（最多 80 条未过期商机的列表级字段）。
 *
 * 断言的是三件事：入参不再是必要条件、脱敏口径没松动、未登录仍然 401。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  requireUserKey: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ opportunitiesRepo: { listOpportunities: mocks.listOpportunities } }),
}));
vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: mocks.requireUserKey,
}));

import { GET } from "@/app/api/opportunities/route";

const req = (qs = "") => new NextRequest(`http://localhost:3000/api/opportunities${qs}`);

/** 一条会撑破 300 字的正文 + 付费外链，用来验脱敏没有松动 */
const ROW = {
  id: 11,
  title: "某设备采购",
  reference: "R-11",
  notice_type: "公开招标",
  agency: "某机构",
  country: "CN",
  deadline: "2026-12-01",
  deadline_ts: 1,
  deadline_sec: 1,
  estimated_value: null,
  description: "x".repeat(500),
  industry: "工程",
  unspsc_codes: JSON.stringify([{ code: "43230000", name: "实验室设备" }]),
  source_url: "https://paid.example/full-detail",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKey.mockResolvedValue({ userId: 7 });
  mocks.listOpportunities.mockResolvedValue([ROW]);
});

describe("GET /api/opportunities — 不再以 UNSPSC code_id 为必要条件", () => {
  it("无入参也返回 200 列表（旧行为是 404 要求 code_id）", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body).toHaveLength(1);
  });

  it("传 code_id 也不再走字典：入参被忽略且列表照常返回", async () => {
    const res = await GET(req("?code_id=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("取数不再带任何过滤实参（字典 JOIN 分支已摘）", async () => {
    await GET(req("?code_id=1&industry_id=2"));
    expect(mocks.listOpportunities).toHaveBeenCalledTimes(1);
    // 关键断言：不是 listOpportunities(1) —— 一旦签名还吃 codeId，这里必红
    expect(mocks.listOpportunities.mock.calls[0]).toEqual([]);
  });

  it("ARCH-P0 脱敏口径不变：description 截断至 301 且不下发 source_url", async () => {
    const body = await (await GET(req())).json();
    expect(body[0].description.length).toBeLessThanOrEqual(301);
    expect(body[0]).not.toHaveProperty("source_url");
    // R5' 主表 JSON 列运行期不再 SELECT ⇒ route 写死 unspsc_codes: []（前端 `|| []` 自动降级）
    expect(body[0].unspsc_codes).toEqual([]);
  });

  it("未登录仍然 401 + 明确错误码（受保护性质没随改造丢掉）", async () => {
    mocks.requireUserKey.mockResolvedValue({ userId: null });
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe(40042);
    expect(body.message).toContain("登录");
    expect(mocks.listOpportunities).not.toHaveBeenCalled();
  });
});
