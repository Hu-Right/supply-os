/**
 * GET  /api/suppliers — 供应商目录列表（公开，支持分页/全量模式）
 * POST /api/suppliers — 供应商入驻注册（需认证）
 *
 * @module app/api/suppliers/route
 * @description GET 返回的 items 已通过 mapSupplierRow 映射为前端 Supplier DTO，
 *              含多语言译文（crm_supplier_translations）与联系方式脱敏。
 *              DB 查询失败时返回空结构（非 500），前端显示空状态而非白屏。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { mapSupplierRow } from "@/lib/services/suppliers";
import type { SupplierDirectoryRow, SupplierTranslationRow, SupplierRegistrationRepo } from "@/lib/repos/suppliers";
import type { Supplier } from "@/types";
import crypto from "crypto";

/**
 * 批量映射：原始 DB 行 → 前端 Supplier DTO。
 * 先按当前语言批量取译文（best-effort，失败静默降级到中文兜底），
 * 再逐行调用 mapSupplierRow 完成 column→field 转换与脱敏。
 */
async function mapSupplierItems(
  rows: SupplierDirectoryRow[],
  lang: string,
  registrationRepo: SupplierRegistrationRepo,
): Promise<Supplier[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  let translations: SupplierTranslationRow[] = [];
  try {
    translations = await registrationRepo.listTranslations(lang, ids);
  } catch {
    // 译文查询失败时静默降级：mapSupplierRow 的 fallback 会用中文原文填充 *En 槽
  }
  const trMap = new Map<number, SupplierTranslationRow | null>();
  for (const tr of translations) trMap.set(tr.supplier_id, tr);

  return rows.map((row) => mapSupplierRow(row, trMap.get(row.id) ?? null));
}

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "zh";
  const pageParam = req.nextUrl.searchParams.get("page");
  const ctx = getContext();
  const { directoryRepo, registrationRepo } = ctx.supplier;

  try {
    if (pageParam && Number(pageParam) >= 1) {
      const page = Number(pageParam);
      const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("pageSize")) || 9, 1), 50);
      const offset = (page - 1) * pageSize;
      const search = req.nextUrl.searchParams.get("q")?.trim() || undefined;
      const type = req.nextUrl.searchParams.get("type") || undefined;
      const industry = req.nextUrl.searchParams.get("industry") || undefined;

      const { items, total } = await directoryRepo.listDirectoryPaginated({ limit: pageSize, offset, lang, search, type, industry });
      const dtoItems = await mapSupplierItems(items, lang, registrationRepo);
      return NextResponse.json({ items: dtoItems, total, page, pageSize });
    }

    const rows = await directoryRepo.listDirectory();
    const dtoItems = await mapSupplierItems(rows, lang, registrationRepo);
    return NextResponse.json(dtoItems);
  } catch (err) {
    console.error("[suppliers GET]", err);
    // 兜底：DB 查询失败时返回空结构而非 500，前端显示空状态而非白屏崩溃
    if (pageParam && Number(pageParam) >= 1) {
      return NextResponse.json({ items: [], total: 0, page: Number(pageParam) || 1, pageSize: 9 });
    }
    return NextResponse.json([]);
  }
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
  // 防重哈希：sha256 截断 32 位十六进制（128 位），与外部 CRM crm_suppliers.request_hash
  // 的既有列宽（32）兼容；防重窗口 24h，非对抗性场景，截断不构成安全弱化
  const requestHash = crypto
    .createHash("sha256")
    .update(hashPayload)
    .digest("hex")
    .slice(0, 32);

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
