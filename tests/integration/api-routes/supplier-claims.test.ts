/**
 * /api/supplier-claims 集成测试（供应商认证入驻）
 *
 * @description 覆盖认领编排的三表写入与排他闸口：
 *              - 400：缺 supplier_id / 供应商不存在 / 三种归属排他
 *                （selfBound 已绑定 / boundByOther 被他人认领 / claimPending 处理中）
 *              - 200：本人已有 pending/approved 认领 → 幂等返回
 *              - 201：成功认领 → 三表写入
 *                （supplier_claims INSERT + users 绑定 + supplier.claim_status='pending'）
 *              - GET：认领状态查询
 *              Mock ctx 仓储与 DB Pool，保持路由 + createClaimWithBinding 服务为真实实现。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  findByUserAndSupplier,
  insertClaim,
  findById,
  getClaimOwnership,
  bindSupplier,
  poolExecute,
} = vi.hoisted(() => ({
  findByUserAndSupplier: vi.fn(),
  insertClaim: vi.fn(),
  findById: vi.fn(),
  getClaimOwnership: vi.fn(),
  bindSupplier: vi.fn(),
  poolExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 5, authViaJwt: true }),
  requireUserKey: vi.fn().mockResolvedValue({ userId: 5, authViaJwt: true }),
  extractUserKey: vi.fn().mockResolvedValue({ userId: 5, authViaJwt: true }),
}));

vi.mock("@/lib/middleware/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
}));

// 换绑闸口不在本测试关注面内（其 DB 细查由目录仓储 mock 承载），
// 直接放行并保持签名兼容
vi.mock("@/lib/services/enterprise-binding", () => ({
  readCurrentBinding: vi.fn().mockResolvedValue(null),
  assertBindingAllowsSubject: vi.fn().mockResolvedValue(null),
}));

// 只桩 IO（deleteFile），保留 file-upload 的真实纯常量/工具（LICENSE_URL_PREFIX /
// LICENSE_FILENAME_RE 等）——路由会 import 这些常量，整体替换 mock 会让命名导出不存在而抛错。
vi.mock("@/lib/services/file-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/file-upload")>()),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({ execute: poolExecute }),
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    supplier: {
      claimRepo: { findByUserAndSupplier, insertClaim },
      directoryRepo: { findById, getClaimOwnership },
    },
    user: {
      usersRepo: { bindSupplier },
    },
  }),
}));

function claimPost(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/supplier-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findByUserAndSupplier.mockResolvedValue(null);
  findById.mockResolvedValue({ id: 18084, company: "测试供应商" });
  getClaimOwnership.mockResolvedValue({ selfBound: false, boundByOther: false, claimPending: false });
  insertClaim.mockResolvedValue(9001);
  bindSupplier.mockResolvedValue(undefined);
  poolExecute.mockResolvedValue([{ affectedRows: 1 }]);
});

describe("POST /api/supplier-claims — 排他与校验", () => {
  it("缺 supplier_id → 400", async () => {
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({}));
    expect(res.status).toBe(400);
  });

  it("supplier_id 非正数 → 400", async () => {
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: -1 }));
    expect(res.status).toBe(400);
  });

  it("供应商不存在 → 400 不进入三表写入", async () => {
    findById.mockResolvedValue(null);
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("不存在");
    expect(insertClaim).not.toHaveBeenCalled();
    expect(bindSupplier).not.toHaveBeenCalled();
  });

  it("本人已有 pending 认领 → 200 幂等返回，不重复落库", async () => {
    findByUserAndSupplier.mockResolvedValue({ id: 8001, status: "pending" });
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 18084 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(8001);
    expect(body.status).toBe("pending");
    expect(insertClaim).not.toHaveBeenCalled();
  });

  it("已绑定该企业（selfBound）→ 400 无需重复认领", async () => {
    getClaimOwnership.mockResolvedValue({ selfBound: true, boundByOther: false, claimPending: false });
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 18084 }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("无需重复认领");
  });

  it("被他人绑定（boundByOther）→ 400 归属终态文案", async () => {
    getClaimOwnership.mockResolvedValue({ selfBound: false, boundByOther: true, claimPending: false });
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 18084 }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("已被其他账户认领");
  });

  it("认领处理中（claimPending）→ 400 排他期文案", async () => {
    getClaimOwnership.mockResolvedValue({ selfBound: false, boundByOther: false, claimPending: true });
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 18084 }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("处理中");
  });
});

describe("POST /api/supplier-claims — 成功认领三表写入", () => {
  it("201：claims INSERT + users 绑定 verified + supplier 置 pending", async () => {
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 18084 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe(9001);
    expect(body.status).toBe("pending");
    // 双时钟：1 小时内须上传执照
    expect(body.message).toContain("1 小时");

    // 表 1：认领流水（联系人废弃置 NULL，status='pending'）
    expect(insertClaim).toHaveBeenCalledWith(expect.objectContaining({
      userId: 5,
      supplierId: 18084,
    }));
    // 表 2：账号临时绑定（link_status=verified）
    expect(bindSupplier).toHaveBeenCalledWith(5, 18084, "verified");
    // 表 3：供应商进入认领排他期
    const supplierUpdate = poolExecute.mock.calls.find(([sql]: string[]) =>
      String(sql).includes("UPDATE supplier SET claim_status"));
    expect(supplierUpdate).toBeTruthy();
    expect(supplierUpdate![1]).toEqual([18084]);
  });

  it("非法 license_url 被拒收：不落入 supplier.license_url", async () => {
    const { POST } = await import("@/app/api/supplier-claims/route");
    await POST(claimPost({ supplier_id: 18084, license_url: "https://evil.example.com/x.png" }));
    const supplierUpdate = poolExecute.mock.calls.find(([sql]: string[]) =>
      String(sql).includes("UPDATE supplier SET claim_status"));
    // 无执照分支：UPDATE 不带 license_url 列
    expect(String(supplierUpdate![0])).not.toContain("license_url");
  });

  it("合法 license_url 随认领落库", async () => {
    const { POST } = await import("@/app/api/supplier-claims/route");
    await POST(claimPost({
      supplier_id: 18084,
      license_url: "/api/user/enterprise/license/license_abc123.png",
    }));
    const supplierUpdate = poolExecute.mock.calls.find(([sql]: string[]) =>
      String(sql).includes("license_url"));
    expect(supplierUpdate).toBeTruthy();
  });

  it("insertClaim 失败 → 500 兜底（不泄露内部错误）", async () => {
    insertClaim.mockRejectedValue(new Error("ER_NO_SUCH_TABLE"));
    const { POST } = await import("@/app/api/supplier-claims/route");
    const res = await POST(claimPost({ supplier_id: 18084 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).not.toContain("ER_NO_SUCH_TABLE");
  });
});

describe("GET /api/supplier-claims — 状态查询", () => {
  it("缺 supplier_id → 400", async () => {
    const { GET } = await import("@/app/api/supplier-claims/route");
    const req = new NextRequest("http://localhost:3000/api/supplier-claims");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  // 命名红线② + 2xx 裸载荷：本端点不再套 {success,data}，无记录直接 null
  it("有认领记录 → 200 裸载荷 camelCase；无记录 → null", async () => {
    const { GET } = await import("@/app/api/supplier-claims/route");
    findByUserAndSupplier.mockResolvedValue({
      id: 8001, status: "approved", created_at: "2026-10-01", expires_at: "2026-10-08",
    });
    let req = new NextRequest("http://localhost:3000/api/supplier-claims?supplier_id=18084");
    let res = await GET(req);
    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.createdAt).toBe("2026-10-01");
    expect(body.expiresAt).toBe("2026-10-08");
    expect(body.created_at).toBeUndefined();
    expect(body.expires_at).toBeUndefined();
    expect(body.data).toBeUndefined();

    findByUserAndSupplier.mockResolvedValue(null);
    req = new NextRequest("http://localhost:3000/api/supplier-claims?supplier_id=18084");
    res = await GET(req);
    body = await res.json();
    expect(body).toBeNull();
  });
});
