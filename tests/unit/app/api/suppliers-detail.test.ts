import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 路由经 @/lib/db/pool 顶层 import "server-only"：jsdom 环境没有 react-server
// 解析条件，会命中 server-only/index.js 的抛错分支（整份测试在 import 阶段就失败）。
// 与全仓其余单测一致，在导入路由前把它替成空模块。
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findByIdWithFallback: vi.fn(),
  findByIdAnyStatus: vi.fn(),
  isClaimed: vi.fn(),
  findProfileById: vi.fn(),
  extractUserKey: vi.fn(),
  // 显式给返回类型：async () => null 会把 mock 推断死成 Promise<null>，后面 mockResolvedValue(行对象) 过不了 tsc
  findClaimantScorecard: vi.fn<(supplierId: number) => Promise<unknown>>(async () => null),
  supplierViewOf: vi.fn(() => ({ id: "sup-db-39479", nameZh: "杭州中建工程技术有限公司" })),
}));

// 详情页成绩单装配会 new SupplierDiagnosisRepo(getPool())；单测全程假仓储，不连库。
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({}) }));
vi.mock("@/lib/repos/supplier-diagnosis.repo", () => ({
  SupplierDiagnosisRepo: class {
    findClaimantScorecard = mocks.findClaimantScorecard;
  },
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    dbPool: {},
    user: { usersRepo: { findProfileById: mocks.findProfileById } },
    supplier: {
      directoryRepo: {
        findByIdWithFallback: mocks.findByIdWithFallback,
        findByIdAnyStatus: mocks.findByIdAnyStatus,
        isClaimed: mocks.isClaimed,
      },
      industryRepo: {},
    },
  }),
}));
vi.mock("@/lib/middleware/auth", () => ({
  extractUserKey: mocks.extractUserKey,
  requireUserKeyOrThrow: vi.fn(),
}));
vi.mock("@/lib/services/suppliers", () => ({ supplierViewOf: mocks.supplierViewOf }));
vi.mock("@/lib/services/industry-labels", () => ({
  loadSupplierIndustryInfo: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/services/country/alias-store", () => ({
  loadCountryAliasSnapshot: vi.fn(async () => undefined),
}));

import { GET } from "@/app/api/suppliers/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function req(url = "http://localhost:3000/api/suppliers/39479") {
  return new NextRequest(url);
}

const approvedRow = {
  id: 39479,
  company: "杭州中建工程技术有限公司",
  products: "钢结构工程",
  certification: "",
  country_code: "CN",
  business_type_code: null,
  data_quality_score: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isClaimed.mockResolvedValue(false);
  mocks.extractUserKey.mockResolvedValue({ userId: 0, authViaJwt: false });
  mocks.findClaimantScorecard.mockResolvedValue(null);
});

describe("GET /api/suppliers/[id]", () => {
  it("审批通过的供应商：公开可见 200", async () => {
    mocks.findByIdWithFallback.mockResolvedValue(approvedRow);
    const res = await GET(req(), params("39479"));
    expect(res.status).toBe(200);
    expect(mocks.findByIdAnyStatus).not.toHaveBeenCalled();
    // 无归属人报告时成绩单缺席，但键仍在（前端按 null 不渲染卡片）
    expect((await res.json()).scorecard).toBeNull();
  });

  it("有归属人成绩单：随详情返回，且按 id 取数", async () => {
    mocks.findByIdWithFallback.mockResolvedValue(approvedRow);
    mocks.findClaimantScorecard.mockResolvedValue({
      score_total: 82,
      score_grade: "A",
      score_breakdown: {
        dimensions: [{ name: "交付能力", nameEn: "Delivery", weightedScore: 18, weight: 20 }],
      },
      submitted_at: new Date("2026-11-12T02:00:00.000Z"),
    });
    const res = await GET(req(), params("39479"));
    expect(res.status).toBe(200);
    expect(mocks.findClaimantScorecard).toHaveBeenCalledWith(39479);
    const body = await res.json();
    expect(body.scorecard).toMatchObject({
      totalScore: 82,
      grade: "A",
      gradeLabel: "A — 首批正式应标",
      dimensions: [{ name: "交付能力", score: 18, max: 20 }],
    });
    // 公开面只出结论：原始作答/短板/证据不得透出
    expect(body.scorecard.topGaps).toBeUndefined();
  });

  it("pending 主体：匿名访问 404（不得把 404 吞成 500）", async () => {
    mocks.findByIdWithFallback.mockResolvedValue(null);
    const res = await GET(req(), params("39479"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe(40044);
  });

  it("pending 主体：本人绑定账号可查看自己的档案 200", async () => {
    mocks.findByIdWithFallback.mockResolvedValue(null);
    mocks.extractUserKey.mockResolvedValue({ userId: 6, authViaJwt: true });
    mocks.findProfileById.mockResolvedValue({ supplier_id: 39479 });
    mocks.findByIdAnyStatus.mockResolvedValue(approvedRow);
    const res = await GET(req(), params("39479"));
    expect(res.status).toBe(200);
    expect(mocks.findByIdAnyStatus).toHaveBeenCalledWith(39479);
  });

  it("pending 主体：非绑定账号访问 404", async () => {
    mocks.findByIdWithFallback.mockResolvedValue(null);
    mocks.extractUserKey.mockResolvedValue({ userId: 7, authViaJwt: true });
    mocks.findProfileById.mockResolvedValue({ supplier_id: 302 });
    const res = await GET(req(), params("39479"));
    expect(res.status).toBe(404);
    expect(mocks.findByIdAnyStatus).not.toHaveBeenCalled();
  });

  it("非法 ID → 400", async () => {
    const res = await GET(req("http://localhost:3000/api/suppliers/abc"), params("abc"));
    expect(res.status).toBe(400);
    expect(mocks.findByIdWithFallback).not.toHaveBeenCalled();
  });
});
