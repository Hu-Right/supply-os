/**
 * GET  /api/suppliers — 供应商目录列表（公开，支持分页/全量模式）
 * POST /api/suppliers — 供应商入驻注册（需认证）
 *
 * @module app/api/suppliers/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "zh";
  const pageParam = req.nextUrl.searchParams.get("page");
  const ctx = getContext();
  const { directoryRepo } = ctx.supplier;

  if (pageParam && Number(pageParam) >= 1) {
    const page = Number(pageParam);
    const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("pageSize")) || 9, 1), 50);
    const offset = (page - 1) * pageSize;
    const search = req.nextUrl.searchParams.get("q")?.trim() || undefined;
    const type = req.nextUrl.searchParams.get("type") || undefined;
    const industry = req.nextUrl.searchParams.get("industry") || undefined;

    const { items, total } = await directoryRepo.listDirectoryPaginated({ limit: pageSize, offset, lang, search, type, industry });
    return NextResponse.json({ items, total, page, pageSize });
  }

  const rows = await directoryRepo.listDirectory();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const ctx = getContext();
  const { registrationRepo } = ctx.supplier;

  // 构建请求哈希（防重提交）
  const hashPayload = JSON.stringify({
    name: body.nameZh,
    contact: body.contactPerson,
    email: body.contactEmail,
  });
  const requestHash = crypto.createHash("md5").update(hashPayload).digest("hex");

  // 防重：同哈希 24h 内不重复提交
  const existing = await registrationRepo.findCrmByRequestHash(requestHash);
  if (existing) {
    return NextResponse.json(
      { code: 40019, message: "该公司已注册或近期已提交过", error: "已注册" },
      { status: 409 },
    );
  }

  try {
    const id = await registrationRepo.insertCrmSupplier({
      companyName: body.nameZh || "",
      contactName: body.contactPerson || "",
      telephone: body.contactPhone || "",
      email: body.contactEmail || "",
      mainProduct: Array.isArray(body.mainProductsZh) ? body.mainProductsZh.join(", ") : "",
      industry: body.industryZh || "",
      certification: Array.isArray(body.complianceLabelsZh) ? body.complianceLabelsZh.join(", ") : "",
      requestHash,
    });

    const supplier = await registrationRepo.findCrmById(id);
    return NextResponse.json(supplier || { id }, { status: 201 });
  } catch (err) {
    console.error("[suppliers POST]", err);
    return NextResponse.json({ code: 50000, message: "注册失败" }, { status: 500 });
  }
}
