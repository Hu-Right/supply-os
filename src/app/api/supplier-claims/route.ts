/**
 * POST /api/supplier-claims — 供应商认领（需认证）
 *
 * 显式字段装配（审查报告 F9）：身份一律取自 JWT 的 auth.userKey。
 * 此前 `{ ...body, user_key: auth.userKey }` 的 snake_case 键未被 repo 读取，
 * 实际生效的是客户端可任意伪造的 body.userKey（mass assignment），
 * 且正常前端请求因缺少 userKey 直接绑定报错 500。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

const str = (v: unknown, max: number): string =>
  String(v ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40000, message: "请求数据格式错误" }, { status: 400 });
  }

  const supplierIdRaw = Number(body.supplierId ?? body.supplier_id);
  const supplierId = Number.isFinite(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null;

  const ctx = getContext();
  try {
    const result = await ctx.supplier.claimRepo.insertClaim({
      userKey: auth.userKey,
      supplierId,
      companyName: str(body.companyName ?? body.company_name, 200),
      supplierType: str(body.supplierType ?? body.supplier_type, 50),
      contactName: str(body.contactName ?? body.contact_name, 100),
      contactPhone: str(body.contactPhone ?? body.contact_phone, 50),
      contactEmail: str(body.contactEmail ?? body.contact_email, 190),
      businessLicenseNo: str(body.businessLicenseNo ?? body.business_license_no, 100),
    });
    return NextResponse.json({ success: true, id: result, status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("[supplier-claims POST]", err);
    return NextResponse.json({ code: 50000, message: "认领失败" }, { status: 500 });
  }
}
