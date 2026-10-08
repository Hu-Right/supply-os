/**
 * PUT /api/user/enterprise — 已认证主体身份三要素不可改写
 * @module tests/unit/api/user/enterprise-put-identity-guard.test.ts
 * @description 堵住「换主体」的最后一条暗道：已认证账号原本可以用 PUT 把 company /
 *              name_confirmed / credit_code 直接改成另一家公司，等于绕过审核把平台认证
 *              挪到别处（POST/认领侧已被账号排他拦死，编辑侧却没有）。口径：
 *              1. verified + 身份字段有实际变化 → 400，不落库；
 *              2. verified + 身份字段原值回传（表单每次都全量提交）→ 放行；
 *              3. verified + 只改联系方式等非身份字段 → 放行；
 *              4. pending（审核中）→ 允许补正身份字段（这正是驳回/审核期的正当路径）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/services/file-upload", () => ({ deleteFile: vi.fn() }));

import { PUT } from "@/app/api/user/enterprise/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";

const STORED = {
  id: 100,
  company: "杭州原绑定企业有限公司",
  name_confirmed: "杭州原绑定企业有限公司",
  credit_code: "91330100MA2XXXXXX1",
  contact: "张三",
  phone: "15800000000",
};

function buildCtx(rowOverride: Record<string, unknown> = {}) {
  const directoryRepo = {
    findProfileById: vi.fn(),
    findFullById: vi.fn().mockResolvedValue({ ...STORED, ...rowOverride }),
    updateEnterprise: vi.fn().mockResolvedValue(undefined),
    updateLicenseUrl: vi.fn().mockResolvedValue(undefined),
  };
  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ id: 42, supplier_id: 100, supplier_link_status: "verified" }),
    bindSupplier: vi.fn(),
  };
  return { ctx: { user: { usersRepo }, supplier: { directoryRepo, claimRepo: { extendPendingClaimExpiry: vi.fn() } } }, directoryRepo };
}

function putReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/user/enterprise", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("PUT /api/user/enterprise 身份三要素闸口", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
  });

  it("已认证：改统一社会信用代码 → 400，不落库", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: STORED.company, credit_code: "91310000ZZZZZZZZ9" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("主体");
    expect(directoryRepo.updateEnterprise).not.toHaveBeenCalled();
  });

  it("已认证：把公司名改成另一家 → 400", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done", claim_status: "verified" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: "上海另一家公司有限公司" }));
    expect(res.status).toBe(400);
    expect(directoryRepo.updateEnterprise).not.toHaveBeenCalled();
  });

  it("已认证：身份字段原值回传（表单全量提交）→ 放行", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({
      company: STORED.company,
      name_confirmed: STORED.name_confirmed,
      credit_code: STORED.credit_code,
      products: "新增主营产品",
    }));
    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalledWith(100, expect.objectContaining({ products: "新增主营产品" }));
  });

  it("已认证：只改联系类字段 → 放行且不查库（无身份键）", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ contact: "李四", phone: "13900000000" }));
    expect(res.status).toBe(200);
    expect(directoryRepo.findFullById).not.toHaveBeenCalled();
    expect(directoryRepo.updateEnterprise).toHaveBeenCalled();
  });

  it("审核中：允许补正身份字段（驳回/审核期的正当路径）", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "pending" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: "杭州原绑定企业有限公司", credit_code: "91330100MA2YYYYYY2" }));
    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalled();
  });
});
