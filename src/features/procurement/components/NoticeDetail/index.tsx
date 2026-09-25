/**
 * 招标详情页（模块03 设计图还原）— 拆分后主入口
 * Notice Detail Page — Module 03 Design Mockup
 *
 * @module features/procurement/components/NoticeDetail
 * @description 按「3-招标详情页」样图重排：面包屑 + 标题标签区 + 9列信息速览表 +
 *              Tab 导航 + 双栏布局（左：AI摘要/概况速览，右：下一步动作面板）。
 *              免费用户可判断价值，付费用户获取完整执行信息。
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { useOptionalAuth, useUserId } from "@/core/auth";
import type { NoticeItem, NoticeDetailItem, MembershipStatus } from "../../types";
import { useNoticeTranslation } from "../../hooks/useNoticeTranslation";
import { useAiAnalysis } from "../../hooks/useAiAnalysis";
import { noticeTypeKey } from "@/shared/utils/notice-type";
import { collectBreakdownFiles } from "../NoticeUnlockedDetails";
import { ReportUnavailableBanner } from "../ReportUnavailableBanner";
import { NoticeDescriptionSection } from "../NoticeDescriptionSection";
import { NoticeBreakdownIndicator } from "../NoticeBreakdownIndicator";
import { NoticeCoreContent } from "../NoticeCoreContent";
import { NoticeDetailSidebar } from "../NoticeDetailSidebar";
import { ReportPreviewPanel } from "../ReportPreviewPanel";
import { AiSummarySection } from "../AiSummarySection";
import { NextStepsPanel } from "../NextStepsPanel";
import { getCountdown } from "@/shared/utils/countdown";

import { DetailHeader } from "./DetailHeader";
import { DetailTabs } from "./DetailTabs";
import { tabPanelId, tabTriggerId } from "./utils";
import { QualificationTab } from "./QualificationTab";
import { FilesTab } from "./FilesTab";
import { SimilarTab } from "./SimilarTab";
import { AiEvaluationPanel } from "../AiEvaluationPanel";
import { useAiMatch } from "../../hooks/useAiMatch";
import { AwardHistoryTab } from "./AwardHistoryTab";

interface NoticeDetailProps {
  notice: NoticeDetailItem;
  actionMessage: string;
  membership: MembershipStatus | null;
  canUsePaidQuota: boolean;
  isVip: boolean;
  totalRemaining: number;
  isLoggedIn: boolean;
  onBack: () => void;
  onExpressInterest: (notice: NoticeItem, type: "interested" | "subscribed") => void;
  onUnlock: (notice: NoticeItem) => void;
  /** 打开另一条公告（相似机会 Tab 点击跳转） */
  onOpenNotice: (notice: NoticeItem) => void;
  /** 当前公告是否已收藏 */
  favorited: boolean;
  /** 收藏/取消收藏（未登录由 hook 内部触发登录） */
  onToggleFavorite: () => void;
  detailLoading?: boolean;
}

export function NoticeDetail({
  notice, actionMessage, membership, canUsePaidQuota, isVip,
  totalRemaining, isLoggedIn, onBack, onExpressInterest, onUnlock, onOpenNotice,
  favorited, onToggleFavorite,
  detailLoading,
}: NoticeDetailProps) {
  const { t, locale } = useLocale();
  const authContext = useOptionalAuth();
  const userId = useUserId();
  const router = useRouter();
  const noticeId = (notice as { id?: number }).id;
  // 锁定态：core_locked === false 为已解锁（列表标记或 /detail 合并结果）。
  // 上移至 hooks 之前：AI 摘要与翻译一致，锁定态不发请求/不开放"开始分析"（后端必 403 core_locked）。
  const coreUnlocked = notice.core_locked === false;
  // 档位中文能力（服务端按矩阵下发 gates）：notice_translation 控译文、ai_summary 控 AI 摘要。
  // free/included 才算当前用户享有；其余（upgrade/contact/unlock）一律回落原文。
  const gates = membership?.gates;
  const canSeeChinese = gates?.notice_translation === "free" || gates?.notice_translation === "included";
  const aiSummaryEnabled = gates?.ai_summary === "free" || gates?.ai_summary === "included";
  const aiSummary = useAiAnalysis(noticeId, isLoggedIn, coreUnlocked, aiSummaryEnabled);
  const aiMatch = useAiMatch(noticeId);
  const [activeTab, setActiveTab] = useState("summary");
  const [countdown, setCountdown] = useState(getCountdown(notice.deadline_ts));

  // 倒计时每秒刷新
  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdown(notice.deadline_ts)), 1000);
    return () => clearInterval(id);
  }, [notice.deadline_ts]);

  // 切换到另一条公告（如相似机会跳转）时回到概况 Tab
  useEffect(() => {
    setActiveTab("summary");
  }, [notice.id]);

  // 翻译：锁定态不发起请求——/translation 同属付费墙闸口（ARCH-P0 2026-09-05），
  // 锁定态发起必 403 core_locked；锁定面板标题来自列表 i18n 字段，无需译文。
  // 解锁后 core_locked 翻转为 false，钩子自动补发。
  const { translation, displayTitle: hookDisplayTitle, translating, failed, showOriginal, toggleOriginal } = useNoticeTranslation(
    coreUnlocked && canSeeChinese ? (notice as { id?: number }).id : undefined, locale,
    `${notice.title || ""}\n${notice.description || ""}`,
    canSeeChinese && locale === "zh" ? (notice.title_i18n || undefined) : undefined,
  );
  // 标题回退链：无中文能力→原文标题；否则 hook 译文 > 列表 i18n 标题 > 原文
  const displayTitle = canSeeChinese
    ? (hookDisplayTitle || notice.title_i18n || notice.title)
    : notice.title;
  const displayDescription = !canSeeChinese
    ? (notice.original_description || notice.description)
    : showOriginal
      ? (notice.original_description || notice.description)
      : (locale === "zh" && notice.description_cn) || translation?.description || notice.description;
  const descResolved = canSeeChinese && locale === "zh" && !!notice.description_cn;
  const showTranslating = canSeeChinese && translating && !descResolved;
  // 切换按钮可见性：需有中文能力且有译文（API 译文 或 description_cn 直出）
  const hasTranslation = canSeeChinese && (!!translation || descResolved);

  // 锁定态展示项
  const showSkeleton = !coreUnlocked && !!detailLoading;
  const breakdownFileCount = coreUnlocked
    ? collectBreakdownFiles(notice).length
    : typeof notice.breakdown_file_count === "number" ? notice.breakdown_file_count : undefined;
  const hasReport = coreUnlocked
    ? notice.report_available === true
    : typeof notice.report_available === "boolean" ? notice.report_available : notice.is_featured === true;
  const reportKnown = coreUnlocked || typeof notice.report_available === "boolean" || typeof notice.is_featured === "boolean";
  const typeKey = noticeTypeKey(notice.notice_type);
  const showReportGuide = !showSkeleton && reportKnown && !hasReport;
  const visibleAgency = coreUnlocked
    ? notice.agency_i18n || notice.agency_full || notice.agency || notice.organization || t("procurement_unknownAgency")
    : showSkeleton ? t("procurement_loading")
    : notice.agency_i18n || notice.agency || notice.organization || t("procurement_unknownAgency");

  // 信息表数据
  const publishDate = notice.published_date || "-";
  const deadlineText = notice.deadline || t("procurement_noDeadline");
  const budgetText = notice.estimated_value || t("procurement_budgetPending");
  const typeLabel = typeKey ? t(typeKey) : notice.notice_type || "-";

  return (
    <div className="space-y-5">
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <DetailHeader
          displayTitle={displayTitle} typeLabel={typeLabel}
          noticeId={notice.reference} visibleAgency={visibleAgency} country={notice.country || ""} sourceUrl={notice.source_url}
          publishDate={publishDate} deadlineText={deadlineText} countdown={countdown}
          budgetText={budgetText} onBack={onBack} t={t} locale={locale}
          favorited={favorited} onToggleFavorite={onToggleFavorite}
        />

        <DetailTabs activeTab={activeTab} setActiveTab={setActiveTab} t={t} gates={membership?.gates} coreUnlocked={coreUnlocked} />

        {/* ═══ 操作消息 ═══ */}
        {actionMessage && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 mb-5">
            {actionMessage}
          </div>
        )}

        {/* ═══ 双栏布局：左（Tab 内容）+ 右（下一步动作） ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          {/* ── 左栏：根据 activeTab 切换内容（ARIA tabpanel 与 DetailTabs 联动）── */}
          <main
            role="tabpanel"
            id={tabPanelId(activeTab)}
            aria-labelledby={tabTriggerId(activeTab)}
            tabIndex={0}
            className="min-w-0 space-y-6 pb-24 md:pb-0"
          >
            {activeTab === "summary" && (
              <>
                <AiSummarySection
                  data={aiSummary.data}
                  loading={aiSummary.loading}
                  streaming={aiSummary.streaming}
                  error={aiSummary.error}
                  llmConfigured={aiSummary.llmConfigured}
                  locked={!coreUnlocked}
                  upgradeLocked={coreUnlocked && !aiSummaryEnabled}
                  onUpgrade={() => router.push("/membership")}
                  onStart={() => aiSummary.triggerAnalysis(false)}
                  onConfigure={() => router.push("/settings/ai-model")}
                  onRequestUnlock={() => onUnlock(notice)}
                  onRegenerate={() => aiSummary.triggerAnalysis(true)}
                />

                <NoticeDescriptionSection
                  translating={showTranslating} failed={failed}
                  hasTranslation={hasTranslation} showOriginal={showOriginal}
                  showTranslated={!showOriginal && hasTranslation}
                  toggleOriginal={toggleOriginal}
                  displayDescription={displayDescription}
                  descriptionTruncated={!!notice.description_truncated}
                />

                {!showSkeleton && (
                  <NoticeBreakdownIndicator
                    hasReport={hasReport} reportKnown={reportKnown}
                    breakdownFileCount={breakdownFileCount}
                  />
                )}

                {showReportGuide && notice.id != null && (
                  <ReportUnavailableBanner
                    noticeId={notice.id} isVip={isVip}
                    isLoggedIn={!!authContext?.authUser}
                  />
                )}

                {notice.id != null && userId && reportKnown && hasReport && (
                  <ReportPreviewPanel
                    noticeId={notice.id} userId={userId} isVip={isVip}
                    onUnlock={onUnlock} coreLocked={!coreUnlocked}
                  />
                )}

                <NoticeCoreContent
                  notice={notice} coreUnlocked={coreUnlocked}
                  showSkeleton={showSkeleton} breakdownFileCount={breakdownFileCount}
                />
              </>
            )}

            {activeTab === "qualification" && (
              <QualificationTab notice={notice} coreUnlocked={coreUnlocked} isVip={isVip} />
            )}

            {activeTab === "files" && (
              <FilesTab notice={notice} coreUnlocked={coreUnlocked} isVip={isVip} />
            )}

            {activeTab === "ai-score" && (
              <AiEvaluationPanel
                data={aiMatch.data}
                loading={aiMatch.loading}
                cacheLoading={aiMatch.cacheLoading}
                error={aiMatch.error}
                onStart={() => aiMatch.triggerMatch(false)}
                onRegenerate={() => aiMatch.triggerMatch(true)}
                onGoToPool={() => router.push("/settings/supplier-pool")}
                onGoToEnterprise={() => router.push("/settings/enterprise")}
                onEditDiag={() => router.push("/settings/supplier-pool")}
              />
            )}

            {activeTab === "history" && (
              <AwardHistoryTab noticeId={noticeId} />
            )}

            {activeTab === "similar" && (
              <SimilarTab notice={notice} onOpen={onOpenNotice} />
            )}
          </main>

          {/* ── 右栏：下一步动作面板（首屏可见） ── */}
          {/* onJoinCrm 不接订阅动作：四步引导的"加入CRM跟进"保持字面行为（跳转 /crm），
              订阅商机按钮是 interest_type=subscribed 的唯一入口，避免同一请求两个入口 */}
          <div className="space-y-4 lg:sticky lg:top-24">
            <NextStepsPanel
              notice={notice} isLoggedIn={isLoggedIn} isVip={isVip}
              canUsePaidQuota={canUsePaidQuota}
              onUnlock={() => onUnlock(notice)}
              onExpressInterest={(type) => onExpressInterest(notice, type)}
            />
          </div>
        </div>
      </article>

      {/* 原有侧边栏（移动端底栏操作按钮） */}
      <NoticeDetailSidebar
        notice={notice} membership={membership}
        canUsePaidQuota={canUsePaidQuota} isVip={isVip}
        totalRemaining={totalRemaining} isLoggedIn={isLoggedIn}
        showSkeleton={showSkeleton}
        onExpressInterest={onExpressInterest}
        onUnlock={onUnlock}
      />
    </div>
  );
}
