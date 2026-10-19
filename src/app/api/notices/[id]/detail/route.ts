/**
 * GET /api/notices/:id/detail — 公告详情（需认证+解锁）
 *
 * @module app/api/notices/[id]/detail/route
 * @description /content 端点已拆分到 [id]/content/route.ts。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "@/lib/services/notices";
import { loadPlatformAliasSnapshot } from "@/lib/services/platform/alias-store";
import { platformInfo } from "@/lib/services/platform/resolve";
import { canAccessNotice } from "@/lib/services/industry-scope";
import { EC_OUT_OF_CATEGORY } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, 40000, "无效的公告 ID");

    const ctx = getContext();
  // 行业墙：被行业限定档位的用户只能访问其绑定品目大类内的公告（8,800元/行业口径）
  if (!(await canAccessNotice(ctx.dbPool, ctx.benefitSystemRepo, auth.userId, noticeId))) {
    routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { out_of_category: true });
  }
    const { detailRepo, unlockRepo } = ctx.notice;

    const [unlock, notice] = await Promise.all([
      unlockRepo.findUnlock(auth.userId, noticeId),
      detailRepo.findDetailPublished(noticeId),
    ]);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });
    if (!notice) routeError(404, 40044, "公告不存在");

    // 查询合格机会：精选公告必有合格机会，report_available/report_url 依赖此数据
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const payload = normalizeNoticeDetailPayload(notice, unlock, opportunity);
    // 来源平台归一：服务端读 crm_platform_aliases（唯一入口）解析后随 payload 下发，
    // 前端不再走静态域名字典——展示数据来自表、语言由前端在 canonical/zh 间取舍。
    const platformSnap = await loadPlatformAliasSnapshot(ctx.dbPool);
    const platform = platformInfo(String(notice.url || opportunity?.source_url || ""), platformSnap);
    return NextResponse.json({ ...payload, platform });
  },
);
