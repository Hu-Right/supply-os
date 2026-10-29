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
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices";
import { findPublicDetail } from "@/lib/services/notice-public/read";
import { toNoticeView } from "@/lib/services/notice-public/view";
import { loadPlatformAliasSnapshot } from "@/lib/services/platform/alias-store";
import { platformInfoWithFallback } from "@/lib/services/platform/resolve";
import { enrichAgencyI18n, ensureAgencyDisplayWarmup } from "@/lib/services/search-orchestrator/format";
import { pickNoticeApiLang } from "@/shared/constants/langs";
import { canAccessNotice } from "@/lib/services/industry-scope";
import { EC_OUT_OF_CATEGORY, EC_INVALID_PARAMS, EC_CONTENT_LOCKED, EC_NOT_FOUND } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
  // 行业墙：被行业限定档位的用户只能访问其绑定品目大类内的公告（8,800元/行业口径）
  if (!(await canAccessNotice(ctx.dbPool, ctx.benefitSystemRepo, auth.userId, noticeId))) {
    routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { outOfCategory: true });
  }
    const { unlockRepo } = ctx.notice;

    const [unlock, notice] = await Promise.all([
      unlockRepo.findUnlock(auth.userId, noticeId),
      findPublicDetail(ctx.dbPool, noticeId),
    ]);
    if (!unlock) routeError(403, EC_CONTENT_LOCKED, "公告已锁定，请先解锁", { coreLocked: true });
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 合格商机只用于资格 Tab / 报告；详情主内容字段全部来自服务表原字段。
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const platformSnap = await loadPlatformAliasSnapshot(ctx.dbPool);
    // 来源平台只在解锁后的详情下发（2026-10-28 用户口径：列表/预览一律不下发）；
    // 未命中别名表则回落服务表 platform_name（build 侧域名兜底），两者皆空→ null，前端隐藏该信息位
    const platform = platformInfoWithFallback(
      String(notice.source_url || opportunity?.source_url || ""),
      platformSnap,
      notice.platform_name,
    );
    // 机构名与列表卡片同源（统一中文 2026-10-28）：走 enrichAgencyI18n 同一条链补
    // agency_i18n，再由下面的 view mapper 改名为 agencyI18n。直达深链/新页面进详情时
    // 前端没有列表项可借，缺这一层就会卡片中文、详情英文。
    // 但详情只接**别名表登记名**（registeredOnly）：列表侧的「法国各机构」这类国家级聚合桶
    // 以及 "LAND REGISTRATION管理局" 这种模式合成名在详情上都是信息损失——前端取值链是
    // `agencyI18n || buyerName`，任何非登记名都会直接盖掉真实买家名，而口径是「卡片不露
    // 外文原文，真实买家名进详情看」（2026-10-29 真库探针订正）。
    const locale = pickNoticeApiLang(new URL(req.url).searchParams.get("locale"));
    if (locale) {
      // 只预热别名表快照：详情走 registeredOnly，根本不查下拉聚合缓存，拉它没有任何收益；
      // 而那个聚合查询冷缓存下实测 20s+，多不等一步就多一分详情超时的风险。
      await ensureAgencyDisplayWarmup(ctx.dbPool);
      enrichAgencyI18n([notice as unknown as Record<string, unknown>], locale, { registeredOnly: true });
      // 无登记名时必须显式下发空串：前端解锁合并是 {...preview, ...detail}，
      // 缺键会让锁定态预览里那份聚合名（「法国各机构」）残留下来继续盖住真名。
      (notice as unknown as Record<string, unknown>).agency_i18n = String(
        (notice as unknown as Record<string, unknown>).agency_i18n ?? "",
      );
    }
    // 来源平台对外的唯一形状是上面的 `platform` 对象（canonical/code/zh）。
    // 行上的 platform_name 被 mapper 改名成 platformName 后全仓无人读（引用核查 2026-10-29），
    // 留着就是同一事实的第二份口径——在进 mapper 之前从行上摘掉，与列表侧
    // `delete item.platform_name` 同规格（sourceUrl 不同，解锁后的原文外链有真实消费方）。
    delete (notice as unknown as Record<string, unknown>).platform_name;
    return NextResponse.json({
      // 服务表行先过 view mapper（红线② 唯一收口点），不再把列名当对外契约直接透传；
      // 下面这些补充键直接写 camel——它们读的是商机行（服务端内部形状，仍为列名）。
      ...toNoticeView(notice)!,
      coreLocked: false,
      unlockType: unlock.unlock_type,
      unlockedAt: unlock.unlocked_at,
      platform,
      reportAvailable: !!opportunity,
      reportUrl: opportunity ? `/api/notices/${notice.notice_pk}/report` : "",
      eligibility: opportunity?.eligibility ?? "",
      technicalHurdles: opportunity?.technical_hurdles ?? "",
      supplierConditions: opportunity?.supplier_conditions ?? "",
      bidOverview: opportunity?.bid_overview ?? "",
      descriptionOther: opportunity?.description_other ?? "",
      aiProducts: opportunity?.ai_products ?? null,
      aiAnalysis: opportunity?.ai_analysis ?? null,
      deadlineTimezone: opportunity?.deadline_timezone ?? "",
    });
  },
);
