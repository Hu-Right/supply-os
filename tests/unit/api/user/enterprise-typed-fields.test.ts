/**
 * PUT /api/user/enterprise — 强类型列（DATE / DECIMAL）写入归一与错误出口
 * @module tests/unit/api/user/enterprise-typed-fields.test.ts
 * @description 用户实报故障：企业信息填完保存只看到「服务器内部错误」。根因是
 *              `supplier.established_at` 是 DATE、`registered_capital` 是 DECIMAL(16,2)（元口径），
 *              而表单是无约束文本框：GET 回填的 ISO 串（`2011-07-21T16:00:00.000Z`）原样回传、
 *              或手写「2020年5月」「500万元」，在 STRICT_TRANS_TABLES 下直接撞 SQL 1292/1366，
 *              冒到 withRoute 兜底成 500。口径：
 *              1. 能认的一律归一成库里可写的形制（日期 → YYYY-MM-DD 北京时间；带「万/亿」→ 元）；
 *              2. 认不出的一律 400 并点名是哪一栏，不再让 MySQL 报错替我们说话；
 *              3. 万一还有别处的 SQL 形制错误，也必须翻成 400 而不是 500。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) }) }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/services/file-upload", () => ({ deleteFile: vi.fn(), licenseFilenameFromUrl: () => null }));
vi.mock("@/lib/services/license-change", () => ({ upsertPendingLicenseChange: vi.fn() }));

import { PUT } from "@/app/api/user/enterprise/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";

/** 审核中的自有绑定行：不触发身份闸口，也不补建认领单 */
const BOUND_ROW = {
  id: 100,
  company: "杭州原绑定企业有限公司",
  credit_code: "91330100MA2XXXXXX1",
  verify_status: "pending",
  established_at: new Date("2011-07-21T16:00:00.000Z"),
  registered_capital: "500.00",
};

function buildCtx(updateEnterprise = vi.fn().mockResolvedValue(undefined)) {
  const directoryRepo = {
    findFullById: vi.fn().mockResolvedValue({ ...BOUND_ROW }),
    updateEnterprise,
    updateLicenseUrl: vi.fn(),
  };
  const claimRepo = {
    findByUserAndSupplier: vi.fn().mockResolvedValue({ id: 9, status: "approved" }),
    insertClaim: vi.fn(),
    extendPendingClaimExpiry: vi.fn(),
    // 认领状态改为 supplier_claims 派生（claim_status 已退役，ADR-0017）
    hasPendingClaim: vi.fn().mockResolvedValue(false),
    hasApprovedClaim: vi.fn().mockResolvedValue(false),
  };
  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ id: 42, supplier_id: 100, supplier_link_status: "verified" }),
    bindSupplier: vi.fn(),
  };
  return { ctx: { user: { usersRepo }, supplier: { directoryRepo, claimRepo } }, directoryRepo, claimRepo };
}

function putReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/user/enterprise", { method: "PUT", body: JSON.stringify(body) });
}

describe("PUT /api/user/enterprise 强类型列归一", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
  });

  it("GET 回填的 ISO 串与「500万元」→ 200，落库形制是北京时间日期与元口径数字", async () => {
    const { ctx, directoryRepo } = buildCtx();
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({
      company: BOUND_ROW.company,
      credit_code: BOUND_ROW.credit_code,
      established_at: "2011-07-21T16:00:00.000Z",
      registered_capital: "500万元",
    }));

    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ established_at: "2011-07-22", registered_capital: "5000000" }),
    );
  });

  it("斜杠/中文写法与千分位同样归一（用户手填不是错误）", async () => {
    const { ctx, directoryRepo } = buildCtx();
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ established_at: "2015年6月1日", registered_capital: "1,200.50" }));

    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ established_at: "2015-06-01", registered_capital: "1200.50" }),
    );
  });

  it("成立日期认不出 → 400 点名「成立日期」，不再 500", async () => {
    const { ctx, directoryRepo } = buildCtx();
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ established_at: "去年" }));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("成立日期");
    expect(directoryRepo.updateEnterprise).not.toHaveBeenCalled();
  });

  it("注册资本认不出 → 400 点名「注册资本」，不再 500", async () => {
    const { ctx, directoryRepo } = buildCtx();
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ registered_capital: "很多钱" }));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("注册资本");
    expect(directoryRepo.updateEnterprise).not.toHaveBeenCalled();
  });

  it("兜底：库里仍冒出 SQL 形制错误（1366）时翻成 400 可读提示，而不是 500", async () => {
    const { ctx } = buildCtx(
      vi.fn().mockRejectedValue(
        Object.assign(new Error("Incorrect decimal value: '500万元' for column 'registered_capital'"), {
          code: "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
          errno: 1366,
          sqlState: "HY000",
        }),
      ),
    );
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ registered_capital: "500万元" }));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("格式");
  });
});
