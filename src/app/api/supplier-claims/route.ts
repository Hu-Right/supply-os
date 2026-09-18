/**
 * /api/supplier-claims — 供应商认领
 *
 * POST   提交认领申请（需登录）
 * GET    查询当前用户对某供应商的认领状态（?supplier_id=xx）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

const str = (v: unknown, max: number): string =>
  String(v ?? "").trim().slice(0, max);

/** POST — 提交认领申请 */
export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 5 }, () => `claim:${auth.userId}`);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    routeError(400, 40000, "请求数据格式错误");
  }

  const supplierIdRaw = Number(body.supplierId ?? body.supplier_id);
  const supplierId = Number.isFinite(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null;

  if (!supplierId) {
    routeError(400, EC_INVALID_PARAMS, "必须指定要认领的供应商");
  }

  const ctx = getContext();

  // 防重：检查该用户是否已对该供应商提交过认领
  try {
    const existing = await ctx.supplier.claimRepo.findByUserAndSupplier(auth.userId, supplierId);
    if (existing) {
      return NextResponse.json({
        success: true,
        id: existing.id,
        status: existing.status,
        message: existing.status === "approved" ? "您已认领该供应商" : "您已提交认领申请，请等待审核",
      });
    }
  } catch {
    // 查询失败不阻断
  }

  // 查询供应商信息获取公司名
  const supplier = await ctx.supplier.directoryRepo.findById(supplierId);
  const companyName = supplier?.company || str(body.companyName ?? body.company_name, 200) || "";

  if (!companyName) {
    routeError(400, EC_INVALID_PARAMS, "无法获取供应商名称");
  }

  try {
    const id = await ctx.supplier.claimRepo.insertClaim({
      userId: auth.userId,
      supplierId,
      companyName,
      supplierType: str(body.supplierType ?? body.supplier_type, 50) || "domestic",
      contactName: str(body.contactName ?? body.contact_name, 100),
      contactPhone: str(body.contactPhone ?? body.contact_phone, 50),
      contactEmail: str(body.contactEmail ?? body.contact_email, 190),
      businessLicenseNo: str(body.businessLicenseNo ?? body.business_license_no, 100),
    });
    return NextResponse.json({ success: true, id, status: "pending", message: "认领申请已提交，请等待审核" }, { status: 201 });
  } catch (err) {
    console.error("[supplier-claims POST]", err);
    routeError(500, 50000, "认领申请提交失败");
  }
});

/** GET — 查询当前用户对某供应商的认领状态 */
export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { searchParams } = new URL(req.url);
  const supplierId = Number(searchParams.get("supplier_id") || "0");

  if (!supplierId) {
    routeError(400, EC_INVALID_PARAMS, "缺少 supplier_id 参数");
  }

  const ctx = getContext();
  try {
    const claim = await ctx.supplier.claimRepo.findByUserAndSupplier(auth.userId, supplierId);
    return NextResponse.json({
      success: true,
      data: claim ? { id: claim.id, status: claim.status, created_at: claim.created_at } : null,
    });
  } catch (err) {
    console.error("[supplier-claims GET]", err);
    routeError(500, 50000, "查询认领状态失败");
  }
});
