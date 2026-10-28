/**
 * GET /api/notices/:id/preview — 锁定态有限预览
 *
 * @module app/api/notices/[id]/preview/route
 * @description 数据源为服务宽表投影 notice_public（findPublicDetail），与 /detail、
 *              unified-search 同口径，用于锁定态增强展示；仅返回归一元信息，
 *              绝不吐 description/附件等付费内容。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { findPublicDetail } from "@/lib/services/notice-public/read";
import { enrichAgencyI18n, ensureAgencyI18nWarmup } from "@/lib/services/search-orchestrator/format";
import { pickNoticeApiLang } from "@/shared/constants/langs";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
    const notice = await findPublicDetail(ctx.dbPool, noticeId);
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 机构名与列表卡片同源（统一中文 2026-10-28）：同一回退链取当前界面语言的译名，
    // 只多取一个已登记键 agencyI18n（行上的 snake 列名 agency_i18n 仍不外露）。
    const locale = pickNoticeApiLang(new URL(req.url).searchParams.get("locale"));
    let agencyI18n = "";
    if (locale) {
      await ensureAgencyI18nWarmup(ctx.dbPool);
      const [enriched] = enrichAgencyI18n([notice as unknown as Record<string, unknown>], locale);
      agencyI18n = String(enriched.agency_i18n || "");
    }

    // 有限预览：改读服务宽表投影 notice_public（与 /detail、unified-search 同源的 SSOT），
    // 直接取归一列。这里故意不整行过 toNoticeView：那个 mapper 是改名不裁剪，
    // 会把 description / description_cn / 附件（解锁后内容）一起发出去。
    // 仅返回已登记的键，键名按红线② 用 camelCase（值仍取自行列）。
    return NextResponse.json({
      noticePk: notice.notice_pk,
      reference: notice.reference || "",
      title: notice.title || "",
      noticeTypeCode: notice.notice_type_code || "",
      countryCode: notice.country_code || "",
      buyerName: notice.buyer_name || "",
      // 缺译名时前端自行回退 buyerName（与列表卡片同一链：agencyI18n → buyerName → 占位）
      agencyI18n,
      deadlineTs: notice.deadline_ts ?? null,
      estimatedValue: notice.estimated_value || "",
      // 发布时间：锁定公告深链也应显示此公开元信息（与 /detail、列表、SEO 页同口径）
      publishedTs: notice.published_ts ?? null,
      // 来源平台/source_url 不下发（2026-10-28 用户口径）：解锁后可见信息，
      // 锁定态预览一律不给；解锁后由 /detail 独家下发 platform + sourceUrl。
    });
  },
);
