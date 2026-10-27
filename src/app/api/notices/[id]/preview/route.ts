/**
 * GET /api/notices/:id/preview — 锁定态有限预览
 *
 * @module app/api/notices/[id]/preview/route
 * @description 数据源为服务宽表投影 crm_notice_public（findPublicDetail），与 /detail、
 *              unified-search 同口径，用于锁定态增强展示；仅返回归一元信息，
 *              绝不吐 description/附件等付费内容。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { findPublicDetail } from "@/lib/services/notice-public/read";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { params }) => {

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
    const notice = await findPublicDetail(ctx.dbPool, noticeId);
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 有限预览：改读服务宽表投影 crm_notice_public（与 /detail、unified-search 同源的 SSOT），
    // 直接取归一列，机构名/国家码不再来自基表原始值。仅返回已登记的键：
    // 显式不吐 description/description_cn/附件（付费墙），也不新增 snake 键（② 命名红线）。
    return NextResponse.json({
      notice_pk: notice.notice_pk,
      reference: notice.reference || "",
      title: notice.title || "",
      notice_type_code: notice.notice_type_code || "",
      country_code: notice.country_code || "",
      buyer_name: notice.buyer_name || "",
      deadline_ts: notice.deadline_ts ?? null,
      estimated_value: notice.estimated_value || "",
    });
  },
);
