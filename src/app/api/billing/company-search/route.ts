/**
 * /api/billing/company-search — 发票抬头企业检索（自动补全税号）
 *
 * @module app/api/billing/company-search/route
 * @description
 *   GET ?keyword=公司名称前缀：从平台企业库（供应商主体 + 采购主体）检索企业名称，
 *   返回「名称 + 统一社会信用代码」，供费用中心开票弹窗选中后自动回填税号。
 *   至少 2 个字符才检索，最多 10 条。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { searchCompanies, companyLookupViewOf } from "@/lib/services/billing/company-lookup";

export const GET = withRoute(async (req: NextRequest) => {
  await requireUserKeyOrThrow(req);
  const keyword = (req.nextUrl.searchParams.get("keyword") ?? "").trim();
  if (keyword.length < 2) {
    return NextResponse.json({ items: [] });
  }
  const rows = await searchCompanies(getContext().dbPool, keyword.slice(0, 50));
  return NextResponse.json({ items: companyLookupViewOf(rows) });
});

