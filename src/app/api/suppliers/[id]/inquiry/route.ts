/**
 * POST /api/suppliers/[id]/inquiry — 提交供应商询盘
 *
 * @module app/api/suppliers/[id]/inquiry/route
 * @description 供应商企业主页「发询盘」表单：登录用户提交采购需求，写入 supplier_inquiry，
 *              由运营/企业跟进。非 VIP 用户也可提交（此前唯一动作是升级提示，线索直接流失）。
 *              反滥用：登录态 + 每用户 10 分钟 5 次限流 + 字段长度/格式校验。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { getPool } from "@/lib/db/pool";
import { SupplierInquiryRepo } from "@/lib/repos/supplier-inquiry.repo";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { parseSupplierId } from "@/lib/utils/supplier-id";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_INTERNAL_ERROR } from "@/shared/constants/api";

const DEMAND_MIN = 10;
const DEMAND_MAX = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 联系方式只收「可拨号/可发信」的字面量，不把乱码写进线索表 */
const PHONE_RE = /^[+()\d\s-]{5,30}$/;

function cleanOptional(value: unknown, max: number): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return v.slice(0, max);
}

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);

  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 5 }, () => `inquiry:${auth.userId}`);
  if (rl) return rl;

  const { id } = await params;
  const supplierId = parseSupplierId(id);
  if (!supplierId) {
    routeError(400, EC_INVALID_PARAMS, `无效的供应商 ID: ${id}`);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const demand = String(body.demand ?? "").trim();
  if (demand.length < DEMAND_MIN || demand.length > DEMAND_MAX) {
    routeError(400, EC_INVALID_PARAMS, `采购需求需在 ${DEMAND_MIN}~${DEMAND_MAX} 字之间`);
  }

  const contactPhone = cleanOptional(body.contact_phone, 50);
  if (contactPhone && !PHONE_RE.test(contactPhone)) {
    routeError(400, EC_INVALID_PARAMS, "联系电话格式不正确");
  }
  const contactEmail = cleanOptional(body.contact_email, 200);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    routeError(400, EC_INVALID_PARAMS, "联系邮箱格式不正确");
  }

  // 供应商必须存在且处于门户公开口径（reviewed）；否则线索无法转交
  const ctx = getContext();
  const supplier = await ctx.supplier.directoryRepo.findById(supplierId);
  if (!supplier) {
    routeError(404, EC_NOT_FOUND, `供应商不存在: ${supplierId}`);
  }

  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const clientIp = forwarded.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const locale = String(body.locale ?? "").trim().slice(0, 10) || "zh";
  const quantity = cleanOptional(body.quantity, 100);
  const contactName = cleanOptional(body.contact_name, 100);

  try {
    const inquiryId = await new SupplierInquiryRepo(getPool()).create({
      supplierId,
      userId: auth.userId,
      contactName,
      contactPhone,
      contactEmail,
      demand,
      quantity,
      locale,
      source: "supplier_profile",
      clientIp,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
    return NextResponse.json(
      { success: true, id: inquiryId, message: "询盘已提交，平台将转交供应商并跟进" },
      { status: 201 },
    );
  } catch (err) {
    console.error("[suppliers/:id/inquiry POST]", err);
    routeError(500, EC_INTERNAL_ERROR, "询盘提交失败，请稍后重试");
  }
});
