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

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
    const notice = await findPublicDetail(ctx.dbPool, noticeId);
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // [2026-10-31 机构 i18n 链退役] agencyI18n 不再计算/下发：前端取值链已全面走
    // buyerNameCn || buyerName（写时快照列），读时别名解析零消费方。
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
      buyerNameCn: notice.buyer_name_cn || "",
      deadlineTs: notice.deadline_ts ?? null,
      estimatedValue: notice.estimated_value || "",
      // 发布时间：锁定公告深链也应显示此公开元信息（与 /detail、列表、SEO 页同口径）
      publishedTs: notice.published_ts ?? null,
      // 来源平台/source_url 不下发（2026-10-28 用户口径）：解锁后可见信息，
      // 锁定态预览一律不给；解锁后由 /detail 独家下发 platform + sourceUrl。
    });
  },
);
