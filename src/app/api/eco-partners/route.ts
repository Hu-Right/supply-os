/**
 * GET /api/eco-partners — 第三方服务生态伙伴公开列表（/services 伙伴墙数据源）
 *
 * 公开端点（无鉴权）：营销展示数据，读 eco_partner（迁移 062）。
 * 展示口径（红线② camelCase）：
 *   - suspended 不出网（repo 层已过滤）；
 *   - detail 仅 live 态透出（onboarding/in-talks 无详情可看，宁缺毋假）；
 *   - contact_internal 永不出网（repo SELECT 不含该列，双保险）；
 *   - 多语：scopeEn/regionsEn 为空时前端回退 scope/regions。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import type { EcoPartnerRow } from "@/lib/repos/eco-partner.repo";

/** 单伙伴公开视图（camelCase，红线②；detail 仅 live） */
export interface EcoPartnerPublicView {
  slug: string;
  name: string;
  nameEn: string | null;
  category: string;
  scope: string;
  scopeEn: string | null;
  detail: string | null;
  regions: string;
  regionsEn: string | null;
  logoUrl: string | null;
  featured: boolean;
  status: EcoPartnerRow["status"];
}

function toPublicView(row: EcoPartnerRow): EcoPartnerPublicView {
  return {
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    category: row.category,
    scope: row.scope,
    scopeEn: row.scopeEn,
    // live 才有详情可看；未出方案的签约伙伴（onboarding）与洽谈中一律不给 detail
    detail: row.status === "live" ? row.detail : null,
    regions: row.regions,
    regionsEn: row.regionsEn,
    logoUrl: row.logoUrl,
    featured: row.featured,
    status: row.status,
  };
}

export const GET = withRoute(async (_req: NextRequest) => {
  const ctx = getContext();
  const rows = await ctx.ecoPartnerRepo.listPublic();
  return NextResponse.json(rows.map(toPublicView));
});
