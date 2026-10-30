import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findByIdWithFallback: vi.fn(),
  findByIdAnyStatus: vi.fn(),
  isClaimed: vi.fn(),
  findProfileById: vi.fn(),
  extractUserKey: vi.fn(),
  supplierViewOf: vi.fn(() => ({ id: "sup-db-39479", nameZh: "杭州中建工程技术有限公司" })),
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
});

describe("GET /api/suppliers/[id]", () => {
  it("审批通过的供应商：公开可见 200", async () => {
    mocks.findByIdWithFallback.mockResolvedValue(approvedRow);
    const res = await GET(req(), params("39479"));
    expect(res.status).toBe(200);
    expect(mocks.findByIdAnyStatus).not.toHaveBeenCalled();
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
