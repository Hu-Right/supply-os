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
import { createClaimWithBinding } from "@/lib/services/supplier-claim";
import { assertBindingAllowsSubject, readCurrentBinding } from "@/lib/services/enterprise-binding";

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

  const supplierIdRaw = Number(body.supplier_id);
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

  // 供应商必须存在：认领公司一律以 supplier 档案为准（company_name 不再落库）
  const supplier = await ctx.supplier.directoryRepo.findById(supplierId);
  if (!supplier) {
    routeError(400, EC_INVALID_PARAMS, "要认领的供应商不存在");
  }

  // ── 账号侧换绑闸口（分状态）──
  // 下面的 ownership 只回答「这家主体归谁」，不回答「这个账号已经绑了谁」：
  // 已绑定 A 的账号去认领无人认领的 B 会一路放行，createClaimWithBinding 随即把
  // crm_users.supplier_id 覆盖成 B——审核中的 A 被抛下、已认证的 A 被顶掉，且无入口换回。
  // 现在：A 未拿下认证 → 先显式撤回 A（解绑 + 作废旧 pending 认领）再认领 B；
  // A 已认证 → 400。目标恰为当前绑定行时放行，由下面的 selfBound 分支给「无需重复认领」文案。
  const binding = await readCurrentBinding(ctx, auth.userId);
  await assertBindingAllowsSubject(ctx, auth.userId, binding, supplierId, "claim");

  // ── 排他检查：已被认领的主体直接拒绝，不进入 7 天排他期 ──
  // 区分三种状态给准确文案：旧口径的「正在被认领中，请稍后再试」会误导用户以为
  // 等一等就能认领成功——归属一旦确定就是终态，重试无用。
  const ownership = await ctx.supplier.directoryRepo.getClaimOwnership(supplierId, auth.userId);
  if (ownership.selfBound) {
    routeError(400, EC_INVALID_PARAMS, "您已绑定该企业，无需重复认领");
  }
  if (ownership.boundByOther) {
    routeError(400, EC_INVALID_PARAMS, "该公司已被其他账户认领，无法重复认领");
  }
  if (ownership.claimPending) {
    routeError(400, EC_INVALID_PARAMS, "该公司已有认领申请正在处理中，暂不能重复认领");
  }

  // 计算 7 天后的过期时间
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expiresAtStr = expiresAt.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

  try {
    const result = await createClaimWithBinding(ctx, {
      userId: auth.userId,
      supplierId,
      contactName: str(body.contactName ?? body.contact_name, 100),
      contactPhone: str(body.contactPhone ?? body.contact_phone, 50),
      expiresAt: expiresAtStr,
    });

    return NextResponse.json({
      success: true, id: result.claimId, status: "pending",
      expires_at: result.expiresAt,
      message: "认领成功，请前往企业信息页完善资料并上传营业执照",
    }, { status: 201 });
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
      data: claim ? { id: claim.id, status: claim.status, created_at: claim.created_at, expires_at: claim.expires_at } : null,
    });
  } catch (err) {
    console.error("[supplier-claims GET]", err);
    routeError(500, 50000, "查询认领状态失败");
  }
});
