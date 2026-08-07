import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useOptionalAuth } from "@/core/auth";
import type { NoticeItem, MembershipStatus } from "../types";
import { useNoticeTranslation } from "../hooks/useNoticeTranslation";
import { noticeTypeKey } from "../notice-type";
import { collectBreakdownFiles } from "./NoticeUnlockedDetails";
import { ReportUnavailableBanner } from "./ReportUnavailableBanner";
import { NoticeDescriptionSection } from "./NoticeDescriptionSection";
import { NoticeBreakdownIndicator } from "./NoticeBreakdownIndicator";
import { NoticeCoreContent } from "./NoticeCoreContent";
import { NoticeDetailSidebar, type NoticeDetailPaymentState } from "./NoticeDetailSidebar";
import { ReportPreviewPanel } from "./ReportPreviewPanel";

interface NoticeDetailProps {
  notice: NoticeItem;
  actionMessage: string;
  membership: MembershipStatus | null;
  freeRemaining: number;
  freeQuota: number;
  canUsePaidQuota: boolean;
  isVip: boolean;
  onBack: () => void;
  onExpressInterest: (notice: NoticeItem, type: "interested" | "subscribed") => void;
  onUnlock: (notice: NoticeItem) => void;
  onPayUnlock: (notice: NoticeItem) => void;
  /** 已解锁公告的拓展详情加载中：以骨架屏替代锁定面板，避免闪烁 */
  detailLoading?: boolean;
  /** 内嵌多套餐付费面板（付费墙）状态与回调；paywallNotice 存在时在 aside 渲染面板 */
  payment?: NoticeDetailPaymentState;
}

export function NoticeDetail({
  notice,
  actionMessage,
  membership,
  freeRemaining,
  freeQuota,
  canUsePaidQuota,
  isVip,
  onBack,
  onExpressInterest,
  onUnlock,
  onPayUnlock,
  detailLoading,
  payment,
}: NoticeDetailProps) {
  const { t, locale } = useLocale();
  const authContext = useOptionalAuth();
  // 原文（标题+描述）供内容语言检测：修复“中文原文在英文环境直接展示/在中文环境被无效翻译”
  // 传入 notice.title_i18n 作为预填充种子：API 返回前首帧即显示搜索结果已有的译文标题
  // displayTitle：seed 预填充标题（首帧）→ API 译文标题 → 原文标题
  // translation 仅在 API 完整返回后才非 null，避免 seed 误触发“查看原文”开关
  const { translation, displayTitle: hookDisplayTitle, translating, failed, showOriginal, toggleOriginal } = useNoticeTranslation(
    (notice as { id?: number }).id,
    locale,
    `${notice.title || ""}\n${notice.description || ""}`,
    locale === "zh" ? (notice.title_i18n || undefined) : undefined,
  );
  const showTranslated = !showOriginal && !!translation;
  const displayTitle = hookDisplayTitle || notice.title;
  // 内容展示优先级：统一规则——有机会表数据就用机会表的，不管公告表的
  // 中文环境：description_cn（机会表预生成）→ 翻译链译文 → 原文
  // 其他语言：翻译链译文 → 原文
  // “查看原文”开关统一切回 notice.description
  const displayDescription = showOriginal
    ? notice.description
    : (locale === "zh" && notice.description_cn) || translation?.description || notice.description;
  // 翻译中指示器智能抑制：中文环境 + description_cn 可用时，描述已秒显无需等待翻译 API，
  // 隐藏“AI翻译中…”避免用户困惑（标题由 seed 预填充兜底，也有 title_i18n 即时显示）
  const descResolved = locale === "zh" && !!notice.description_cn;
  const showTranslating = translating && !descResolved;
  const coreUnlocked = notice.core_locked === false;
  // 拆解文件预览指示：解锁后与 NoticeUnlockedDetails 文件清单同源口径（documents+procurement_files 去重）；
  // 锁定态用服务端计数预览字段（本地差异 #19，仅数量不泄清单），缺失时 undefined 回退中性提示
  const breakdownFileCount = coreUnlocked
    ? collectBreakdownFiles(notice).length
    : typeof notice.breakdown_file_count === "number"
      ? notice.breakdown_file_count
      : undefined;
  // 中文版订单拆解报告可用性：解锁后以详情载荷 report_available 为准；
  // 锁定态复用列表页 is_featured（三路合格商机判定与报告可生成为同一口径，零额外查询）；
  // 推荐/兑底载荷无 is_featured 时 reportKnown=false，回退中性提示
  const hasReport = coreUnlocked ? notice.report_available === true : notice.is_featured === true;
  const reportKnown = coreUnlocked || typeof notice.is_featured === "boolean";
  // 已知采购类型走 i18n 本地化，未识别的长尾值原样回退
  const typeKey = noticeTypeKey(notice.notice_type);
  const showSkeleton = !coreUnlocked && !!detailLoading;
  // 中文拆解报告不可用引导：已知无报告 + 非骨架屏时展示微信客服引导横幅
  const showReportGuide = !showSkeleton && reportKnown && !hasReport;
  const visibleAgency = coreUnlocked
    ? notice.agency_full || notice.agency || notice.organization || t("procurement_unknownAgency")
    : showSkeleton
      ? t("procurement_loading")
      // 锁定态渐进式预览：展示预览端点下发的机构名（返回前回退"未知机构"）
      : notice.agency || notice.organization || t("procurement_unknownAgency");

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
        {t("procurement_back")}
      </button>

      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-[900px]:grid-cols-1">
          <main className="min-w-0 space-y-5">
            <div className="border-b border-slate-100 pb-5">
              <p className="text-xs font-black text-teal-600 uppercase tracking-wider">
                {typeKey ? t(typeKey) : notice.notice_type || "Procurement Notice"}
              </p>
              <h3 dir="auto" className="text-2xl md:text-3xl font-extrabold text-slate-950 mt-2 leading-tight">
                {displayTitle}
              </h3>
              <p className="text-sm text-slate-500 mt-3">
                {visibleAgency} ·{" "}
                {notice.country || t("procurement_global")} ·{" "}
                {notice.deadline || t("procurement_noDeadline")}
              </p>
            </div>

            {actionMessage && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                {actionMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              {[
                [t("procurement_metaNo"), notice.reference || notice.notice_id || "-"],
                [t("procurement_agency"), visibleAgency],
                [t("procurement_country"), notice.country || "-"],
                [t("procurement_budget"), notice.estimated_value || t("procurement_budgetPending")],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="font-black text-slate-400 uppercase">{label}</p>
                  <p className="font-bold text-slate-800 mt-1 break-words">{value}</p>
                </div>
              ))}
            </div>

            {/* 拆解文件指示器：中文版报告 > 原始附件计数 > 无拆解文件；可用性未知
                （旧缓存/推荐兑底载荷）回退中性提示；骨架屏期间隐藏防闪变 */}
            {!showSkeleton && (
              <NoticeBreakdownIndicator
                hasReport={hasReport}
                reportKnown={reportKnown}
                breakdownFileCount={breakdownFileCount}
              />
            )}

            {/* 中文拆解报告不可用时：引导用户通过微信客服获得人工定向处理 */}
            {showReportGuide && notice.id != null && (
              <ReportUnavailableBanner
                noticeId={notice.id}
                isVip={isVip}
                isLoggedIn={!!authContext?.authUser}
              />
            )}

            <NoticeDescriptionSection
              translating={showTranslating}
              failed={failed}
              hasTranslation={!!translation}
              showOriginal={showOriginal}
              showTranslated={showTranslated}
              toggleOriginal={toggleOriginal}
              displayDescription={displayDescription}
            />

            {/* 中文版投标拆解报告预览：登录即可见（未解锁展示约 10% + 升级引导）；
                内容按语言环境与数据可用性自适应：zh + description_cn → 中文，其余 → 英文原文兜底 */}
            {notice.id != null && authContext?.authUser?.user_key && (
              <ReportPreviewPanel
                noticeId={notice.id}
                userKey={authContext.authUser.user_key}
                reportUrl={`/api/notices/${notice.id}/report`}
                isVip={isVip}
                onUnlock={onUnlock}
                coreLocked={!coreUnlocked}
              />
            )}

            <NoticeCoreContent
              notice={notice}
              coreUnlocked={coreUnlocked}
              showSkeleton={showSkeleton}
              breakdownFileCount={breakdownFileCount}
            />
          </main>

          <NoticeDetailSidebar
            notice={notice}
            membership={membership}
            freeRemaining={freeRemaining}
            freeQuota={freeQuota}
            canUsePaidQuota={canUsePaidQuota}
            isVip={isVip}
            showSkeleton={showSkeleton}
            onExpressInterest={onExpressInterest}
            onUnlock={onUnlock}
            onPayUnlock={onPayUnlock}
            payment={payment}
          />
        </div>
      </article>
    </div>
  );
}
