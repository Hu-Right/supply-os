/**
 * 供应商企业主页 — 服务端取数
 *
 * @module features/supplier-profile/server/load-supplier-profile
 * @description zh/en 两个供应商详情路由共用一份取数：详情视图、成绩单、相似供应商。
 *              只在服务端组件里 import（repo/pool 均为 server-only 依赖）。
 */
import { cache } from "react";
import { getContext } from "@/lib/db/context";
import { getPool } from "@/lib/db/pool";
import { SupplierDiagnosisRepo } from "@/lib/repos/supplier-diagnosis.repo";
import { supplierScorecardViewOf } from "@/lib/services/supplier-diagnosis/scorecard-view";
import { loadCountryAliasSnapshot } from "@/lib/services/country/alias-store";
import { loadSupplierIndustryInfo } from "@/lib/services/industry-labels";
import { supplierProfileViewOf, type SupplierProfileView } from "@/lib/services/supplier-profile";
import { splitListField } from "@/lib/utils/mask";

/** 同一请求内 generateMetadata 与页面共用一次取数 */
export const loadSupplierProfile = cache(async (dbId: number) => {
  const ctx = getContext();
  // 公开面只认 info_review_status='reviewed'（与列表口径一致）；本人待审档案走 /api 路径
  const row = await ctx.supplier.directoryRepo.findByIdWithFallback(dbId);
  if (!row) return null;

  let industry = null;
  try {
    const info = await loadSupplierIndustryInfo(ctx.supplier.industryRepo, [row]);
    industry = info.get(dbId) ?? null;
  } catch (err) {
    console.error("[supplier/[id]] 行业标签装配失败，本次退回产品首项:", err);
  }
  let snap;
  try {
    snap = await loadCountryAliasSnapshot(ctx.dbPool);
  } catch (err) {
    console.error("[supplier/[id]] 国家别名快照加载失败，本次退回原文:", err);
  }

  let claimed = false;
  try {
    claimed = await ctx.supplier.directoryRepo.isClaimed(dbId);
  } catch {
    // 认领状态查询失败不影响主内容
  }
  return { profile: supplierProfileViewOf(row, industry, snap), claimed };
});

/** 投标能力成绩单（公开面：只认归属人提交的报告） */
export async function loadSupplierScorecard(dbId: number) {
  try {
    const row = await new SupplierDiagnosisRepo(getPool()).findClaimantScorecard(dbId);
    return row ? supplierScorecardViewOf(row, "zh") : null;
  } catch (err) {
    console.error("[supplier/[id]] 成绩单装配失败，本次不渲染:", err);
    return null;
  }
}

export interface SimilarSupplierItem {
  id: number;
  company: string;
  country: string;
  countryCode: string;
  province: string;
  city: string;
  products: string[];
  industryZh: string | null;
  industryEn: string | null;
  quality: number;
}

/**
 * 相似供应商：同行业子树优先，不足按同国家补齐；卡片只取展示所需字段。
 * 相似推荐永远不阻断主页面（异常返回空数组，整段隐藏）。
 */
export async function loadSimilarSuppliers(
  profile: SupplierProfileView,
  limit = 6,
): Promise<SimilarSupplierItem[]> {
  try {
    const ctx = getContext();
    const repo = ctx.supplier.directoryRepo;
    const rows = await repo.findSimilarReviewed({
      excludeId: profile.dbId,
      industryCode: profile.industry.primary?.code ?? null,
      limit,
    });
    const seen = new Set(rows.map((r) => Number(r.id)));
    if (rows.length < limit) {
      const more = await repo.findSimilarReviewed({
        excludeId: profile.dbId,
        countryCode: profile.countryCode || null,
        limit: limit - rows.length,
      });
      for (const r of more) {
        if (!seen.has(Number(r.id))) {
          rows.push(r);
          seen.add(Number(r.id));
        }
      }
    }
    if (rows.length === 0) return [];

    const info = await loadSupplierIndustryInfo(
      ctx.supplier.industryRepo,
      rows as Array<typeof rows[number]>,
    );
    return rows.map((r) => {
      const tag = info.get(Number(r.id))?.primary ?? null;
      return {
        id: Number(r.id),
        company: String(r.company ?? "").trim(),
        country: String(r.country ?? "").trim(),
        countryCode: String(r.country_code ?? "").trim(),
        province: String(r.province ?? "").trim(),
        city: String(r.city ?? "").trim(),
        products: splitListField(r.products).slice(0, 3),
        industryZh: tag?.nameZh ?? null,
        industryEn: tag?.nameEn ?? null,
        quality: Number(r.data_quality_score ?? 0) || 0,
      };
    });
  } catch (err) {
    console.error("[supplier/[id]] 相似供应商装配失败，本次不渲染:", err);
    return [];
  }
}
