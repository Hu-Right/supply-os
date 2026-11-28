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
import { findPublicDetail } from "@/lib/services/notice-public/read";
import { loadNoticeRequirements } from "@/lib/services/notice-public/requirements";
import { findNoticeOpportunityExtras } from "@/lib/services/notice-public/opportunity-extras";
import { toNoticeView } from "@/lib/services/notice-public/view";
import { canReadNoticeTranslation, maskTranslationFields } from "@/lib/services/notice-public/translation-access";
import { loadPlatformAliasSnapshot } from "@/lib/services/platform/alias-store";
import { platformInfoWithFallback } from "@/lib/services/platform/resolve";
import { pickDeadlineZoneToken } from "@/shared/utils/notice-datetime/timezone";
import { canAccessNotice } from "@/lib/services/industry-scope";
import { resolveNoticeAccess } from "@/lib/services/notice-access";
import { QUALIFICATION_ACCESS_BENEFIT, ORIGINAL_FILE_ACCESS_BENEFIT } from "@/lib/services/benefit-matrix";
import { EC_OUT_OF_CATEGORY, EC_INVALID_PARAMS, EC_CONTENT_LOCKED, EC_NOT_FOUND } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();

    // 2026-11-24 单波并行：把「权限判定」与「内容装配」拆成两组互不依赖的查询，
    // 全部在进入条件分支前同时发出——高延迟链路上少等一个完整往返。
    const extrasPromise = findNoticeOpportunityExtras(ctx.dbPool, noticeId);
    const platformSnapPromise = loadPlatformAliasSnapshot(ctx.dbPool);
    const translationPromise = canReadNoticeTranslation(ctx.benefitSystemRepo, auth.userId);

    // [2026-10-30 首屏往返压缩] 三件事互不依赖，并发发出：
    //   - 行业墙判定（canAccessNotice）
    //   - 套餐判定（resolveNoticeAccess）
    //   - 公告宽表行（findPublicDetail）
    // 旧实现先 await 行业墙、再 Promise.all 后两者，宽表行白等一次往返。
    // 行业墙与套餐判定都要读「生效套餐 + 矩阵格」，request-cache 让它们共享同一份读取。
    // 判定顺序与错误码保持原样：先行业越界 403，再锁定 403，最后 404。
    const [allowedByIndustry, access, notice, requirements] = await Promise.all([
      // 行业墙：被行业限定档位的用户只能访问其绑定品目大类内的公告（8,800元/行业口径）
      canAccessNotice(ctx.dbPool, ctx.benefitSystemRepo, auth.userId, noticeId),
      resolveNoticeAccess({
        userId: auth.userId,
        benefitRepo: ctx.benefitSystemRepo,
      }),
      findPublicDetail(ctx.dbPool, noticeId),
      // 结构化资格要求（notice_requirement_items 最新版）；空数组=未抽取，不影响详情主体
      loadNoticeRequirements(ctx.dbPool, noticeId),
    ]);
    if (!allowedByIndustry) {
      routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { outOfCategory: true });
    }
    if (!access.accessibleByPlan) {
      // 资格条件/原始文件是独立权益：matrix 给 free 打开后，只下发对应字段，
      // 不泄露正文/联系人/附件等未授予内容；其余字段仍按 notice_view 锁定。
      const [qualificationEntitled, filesEntitled] = await Promise.all([
        ctx.benefitSystemRepo.isEntitled(auth.userId, QUALIFICATION_ACCESS_BENEFIT),
        ctx.benefitSystemRepo.isEntitled(auth.userId, ORIGINAL_FILE_ACCESS_BENEFIT),
      ]);
      if (!qualificationEntitled && !filesEntitled) {
        routeError(403, EC_CONTENT_LOCKED, "公告已锁定，请先开通会员", { coreLocked: true });
      }
      if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");
      const view = toNoticeView(notice)!;
      const text = (v: unknown): string => (typeof v === "string" ? v : "");
      const payload: Record<string, unknown> = {
        noticePk: view.noticePk,
        coreLocked: true,
      };
      if (qualificationEntitled) {
        payload.qualificationAccess = true;
        payload.registrationLevel = view.registrationLevel ?? null;
        payload.eligibility = text((notice as Record<string, unknown>).eligibility);
        payload.technicalHurdles = text((notice as Record<string, unknown>).technical_hurdles);
        payload.supplierConditions = text((notice as Record<string, unknown>).supplier_conditions);
        // 与资格字段同权：结构化要求清单随 qualification_access 下发
        payload.requirements = requirements;
      }
      if (filesEntitled) {
        payload.fileAccess = true;
        payload.sourceUrl = view.sourceUrl ?? null;
        payload.attachments = view.attachments ?? [];
        payload.externalLinks = view.externalLinks ?? [];
        payload.breakdownFileCount = view.breakdownFileCount ?? null;
      }
      // 锁定分支用不到预取的三个 Promise：挂 catch 避免未处理 rejection（结果直接丢弃）
      void extrasPromise.catch(() => {});
      void platformSnapPromise.catch(() => {});
      void translationPromise.catch(() => {});
      return NextResponse.json(payload);
    }
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 读取口径（2026-11-18 收口）：详情主内容与资格条件全部来自服务表；
    // 只有服务表/宽表都没有的商机产物（拆标概览取宽表，AI 产物取商机窄列）走 extras。
    // 2026-11-24 并行化：extras / 平台别名快照 / 译文权益互不依赖，一次 Promise.all 发完。
    const [extras, platformSnap, canReadTranslation] = await Promise.all([
      extrasPromise,
      platformSnapPromise,
      translationPromise,
    ]);
    // [2026-10-30] 截止时区只留可计算的机器令牌（GMT±HH:MM / UTC / IANA）：
    // 服务表 deadline_timezone 已是归一列（来自 notice_deadline）；商机表那列是抓取页面的原文注释
    // （如「菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）」），不再参与下发。
    // 在进 view mapper 之前就地改行上的列值，对外仍由 toNoticeView 统一改名（不新增响应键）。
    (notice as unknown as Record<string, unknown>).deadline_timezone = pickDeadlineZoneToken(
      (notice as unknown as Record<string, unknown>).deadline_timezone,
    ) || null;
    // 来源平台只在解锁后的详情下发（2026-10-28 用户口径：列表/预览一律不下发）；
    // 未命中别名表则回落服务表 platform_name（build 侧域名兜底），两者皆空→ null，前端隐藏该信息位
    const platform = platformInfoWithFallback(
      String(notice.source_url || ""),
      platformSnap,
      notice.platform_name,
    );
    // [2026-10-31 机构 i18n 链退役] agency_i18n 不再计算/下发：前端取值链已全面走
    // buyerNameCn || buyerName（写时快照列，锁定态预览与解锁合并两侧同链），读时别名
    // 解析（resolveAgencyDisplay）与别名快照预热随之退役；写侧归一也已切到 buyer 实体
    // （旧 agency_aliases 表退役，见 ADR-0016）。
    // 来源平台对外的唯一形状是上面的 `platform` 对象（canonical/code/zh）。
    // 行上的 platform_name 被 mapper 改名成 platformName 后全仓无人读（引用核查 2026-10-29），
    // 留着就是同一事实的第二份口径——在进 mapper 之前从行上摘掉，与列表侧
    // `delete item.platform_name` 同规格（sourceUrl 不同，解锁后的原文外链有真实消费方）。
    delete (notice as unknown as Record<string, unknown>).platform_name;
    // 资格条件：服务表已是构建器从商机投影的归一结果，不再回退商机表（避免双源不一致）
    const text = (v: unknown): string => (typeof v === "string" ? v : "");
    const reportAvailable = !!extras?.opportunityId;
    // 译文按权益下发（2026-11-24 口径 A+3）：没有 notice_translation 的账号拿到的是原文标题/正文，
    // 与列表同口径；有权益的账号保留 title_cn/description_cn，缺失时前端按需机翻补齐。
    const view = toNoticeView(notice)!;
    if (!canReadTranslation) {
      maskTranslationFields(view as unknown as Record<string, unknown>);
    }
    return NextResponse.json({
      // 服务表行先过 view mapper（红线② 唯一收口点），不再把列名当对外契约直接透传；
      // 下面这些补充键直接写 camel——extras 是服务端内部形状，仍为列名。
      ...view,
      coreLocked: false,
      platform,
      reportAvailable,
      reportUrl: reportAvailable ? `/api/notices/${notice.notice_pk}/report` : "",
      eligibility: text((notice as Record<string, unknown>).eligibility),
      technicalHurdles: text((notice as Record<string, unknown>).technical_hurdles),
      supplierConditions: text((notice as Record<string, unknown>).supplier_conditions),
      // 结构化资格要求（按 importance 分组的可判定条目）；空数组=未抽取，前端走"未抽取"态
      requirements,
      bidOverview: extras?.bidOverview ?? "",
      descriptionOther: extras?.descriptionOther ?? "",
      aiProducts: extras?.aiProducts ?? null,
      aiAnalysis: extras?.aiAnalysis ?? null,
    });
  },
);
