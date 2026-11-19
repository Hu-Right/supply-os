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
import {
  computeSupplierSimilarity,
  industryCodeSimilarity,
  resolveMatchKind,
  type SimilarMatchKind,
} from "@/lib/services/supplier-similarity";
import type { SupplierBackboneInterestRow, SupplierDirectoryRow } from "@/lib/repos/suppliers";
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

  // 平台归类（品目兴趣）：只作为辅助展示/匹配；失败不影响页面主内容
  let interests: SupplierBackboneInterestRow[] = [];
  try {
    interests = await ctx.supplier.directoryRepo.findBackboneInterests(dbId);
  } catch (err) {
    console.error("[supplier/[id]] 品目兴趣装配失败，本次不渲染平台归类:", err);
  }

  // 联系方式：绑定账号优先、供应商档案兜底；账户侧查询失败不影响页面
  let accountContact = null;
  try {
    accountContact = await ctx.supplier.directoryRepo.findBoundAccountContact(dbId);
  } catch (err) {
    console.error("[supplier/[id]] 绑定账号联系方式读取失败，回退档案联系方式:", err);
  }

  return { profile: supplierProfileViewOf(row, industry, snap, interests, accountContact), claimed };
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
  /** 相似原因：同品目 / 同行业 / 同地区参考（前端按 locale 出文案） */
  matchKind: SimilarMatchKind;
  /** 同品目原因里展示的品目名（取目标企业品目名的前两个） */
  sharedNames: Array<{ zh: string; en: string }>;
}

/**
 * 相似供应商：品目重叠（倒排召回）∪ 行业 L2 子树召回 → 多维打分 → top N。
 *
 * 不再用「主行业码全前缀 → 同国家兜底」：全码前缀在主码层级较深时必然 0 命中，
 * 会退化成“同国家按完整度排序”，那不是相似。地域只在打分里占 0.03 做 tie-breaker，
 * 且只有企业完全没有任何品目/行业信号时才走同国家参考。
 */
export async function loadSimilarSuppliers(
  profile: SupplierProfileView,
  limit = 6,
): Promise<SimilarSupplierItem[]> {
  try {
    const ctx = getContext();
    const repo = ctx.supplier.directoryRepo;

    const targetCodes = profile.commodityInterests.slice(0, 20).map((c) => ({
      code: c.code,
      confidence: c.confidence,
    }));
    const targetIndustry = profile.industry.primary?.code ?? null;
    const industryDigits = String(targetIndustry ?? "").replace(/^UGT-I-/i, "");
    const industryPrefix =
      industryDigits.length >= 4
        ? `UGT-I-${industryDigits.slice(0, 4)}`
        : targetIndustry;

    const [byCodes, byIndustry] = await Promise.all([
      targetCodes.length > 0
        ? repo.findReviewedByBackboneCodes(targetCodes.map((c) => c.code), profile.dbId, 60)
        : Promise.resolve([]),
      industryPrefix ? repo.findReviewedByIndustryPrefix(industryPrefix, profile.dbId, 60) : Promise.resolve([]),
    ]);

    const candidates = new Map<number, SupplierDirectoryRow>();
    for (const row of [...byCodes, ...byIndustry]) {
      const id = Number(row.id);
      if (id > 0 && id !== profile.dbId) candidates.set(id, row);
    }

    // 完全无品目/行业信号时才允许同国家参考（不把“同国家”当主兜底）
    if (candidates.size === 0 && targetCodes.length === 0 && !targetIndustry && profile.countryCode) {
      const more = await repo.findSimilarReviewed({
        excludeId: profile.dbId,
        countryCode: profile.countryCode,
        limit: 60,
      });
      for (const row of more) candidates.set(Number(row.id), row);
    }
    if (candidates.size === 0) return [];

    const ids = [...candidates.keys()];
    let codesBySupplier = new Map<number, Array<{ code: string; confidence: number | null }>>();
    try {
      const interestRows = await repo.findBackboneInterestsBySupplierIds(ids);
      for (const row of interestRows) {
        const sid = Number(row.supplier_id);
        const list = codesBySupplier.get(sid) ?? [];
        const conf = row.confidence == null ? null : Number(row.confidence);
        list.push({ code: String(row.code ?? ""), confidence: Number.isFinite(conf) ? conf : null });
        codesBySupplier.set(sid, list);
      }
    } catch (err) {
      console.error("[supplier/[id]] 候选品目批量装配失败，本次仅用行业/产品打分:", err);
      codesBySupplier = new Map();
    }

    const targetInput = {
      commodityCodes: targetCodes,
      industryCode: targetIndustry,
      products: profile.products,
      countryCode: profile.countryCode,
      province: profile.province,
      city: profile.city,
      quality: profile.dataCompleteness,
    };

    const scored = [...candidates.values()]
      .map((row) => {
        const id = Number(row.id);
        const candidateInput = {
          commodityCodes: codesBySupplier.get(id) ?? [],
          industryCode: String(row.industry_code ?? "").trim() || null,
          products: splitListField(row.products),
          countryCode: String(row.country_code ?? "").trim(),
          province: String(row.province ?? "").trim(),
          city: String(row.city ?? "").trim(),
          quality: Number(row.data_quality_score ?? 0) || 0,
        };
        const result = computeSupplierSimilarity(targetInput, candidateInput);
        return {
          row,
          result,
          industryScore: industryCodeSimilarity(targetInput.industryCode, candidateInput.industryCode),
        };
      })
      .filter((s) => s.result.score > 0)
      .sort((a, b) => b.result.score - a.result.score || Number(b.row.data_quality_score ?? 0) - Number(a.row.data_quality_score ?? 0))
      .slice(0, Math.max(1, Math.min(limit, 12)));

    if (scored.length === 0) return [];

    const info = await loadSupplierIndustryInfo(
      ctx.supplier.industryRepo,
      scored.map((s) => s.row),
    );
    const targetNameByCode = new Map(profile.commodityInterests.map((c) => [c.code, c]));

    return scored.map(({ row, result, industryScore }) => {
      const tag = info.get(Number(row.id))?.primary ?? null;
      const sharedNames = result.sharedCodes.slice(0, 2).map((code) => {
        const hit = targetNameByCode.get(code);
        return { zh: hit?.nameZh ?? code, en: hit?.nameEn ?? code };
      });
      return {
        id: Number(row.id),
        company: String(row.company ?? "").trim(),
        country: String(row.country ?? "").trim(),
        countryCode: String(row.country_code ?? "").trim(),
        province: String(row.province ?? "").trim(),
        city: String(row.city ?? "").trim(),
        products: splitListField(row.products).slice(0, 3),
        industryZh: tag?.nameZh ?? null,
        industryEn: tag?.nameEn ?? null,
        quality: Number(row.data_quality_score ?? 0) || 0,
        matchKind: resolveMatchKind(result, industryScore),
        sharedNames,
      };
    });
  } catch (err) {
    console.error("[supplier/[id]] 相似供应商装配失败，本次不渲染:", err);
    return [];
  }
}
