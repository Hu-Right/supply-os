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
import { useLocale } from "@/core/i18n";
import { useOptionalAuth, useUserId } from "@/core/auth";
import type { NoticeItem, NoticeDetailItem, MembershipStatus } from "../../types";
import { useNoticeTranslation } from "../../hooks/useNoticeTranslation";
import { noticeTypeKey } from "../../notice-type";
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
import { QualificationTab } from "./QualificationTab";
import { FilesTab } from "./FilesTab";
import { PlaceholderTab } from "./PlaceholderTab";
import type { PlaceholderTabType } from "./PlaceholderTab";

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
  onPayUnlock: (notice: NoticeItem) => void;
  detailLoading?: boolean;
}

export function NoticeDetail({
  notice, actionMessage, membership, canUsePaidQuota, isVip,
  totalRemaining, isLoggedIn, onBack, onExpressInterest, onUnlock, onPayUnlock,
  detailLoading,
}: NoticeDetailProps) {
  const { t, locale } = useLocale();
  const authContext = useOptionalAuth();
  const userId = useUserId();
  const [activeTab, setActiveTab] = useState("summary");
  const [countdown, setCountdown] = useState(getCountdown(notice.deadline_ts));

  // 倒计时每秒刷新
  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdown(notice.deadline_ts)), 1000);
    return () => clearInterval(id);
  }, [notice.deadline_ts]);

  // 翻译
  const { translation, displayTitle: hookDisplayTitle, translating, failed, showOriginal, toggleOriginal } = useNoticeTranslation(
    (notice as { id?: number }).id, locale,
    `${notice.title || ""}\n${notice.description || ""}`,
    locale === "zh" ? (notice.title_i18n || undefined) : undefined,
  );
  const displayTitle = hookDisplayTitle || notice.title;
  const displayDescription = showOriginal
    ? (notice.original_description || notice.description)
    : (locale === "zh" && notice.description_cn) || translation?.description || notice.description;
  const descResolved = locale === "zh" && !!notice.description_cn;
  const showTranslating = translating && !descResolved;
  // 切换按钮可见性：API 译文 或 description_cn 直出均视为"有译文"
  const hasTranslation = !!translation || descResolved;

  // 锁定态
  const coreUnlocked = notice.core_locked === false;
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

  // Tab 权益校验
  const hasMemberAccess = isVip || coreUnlocked;
  const hasProAccess = isVip;

  return (
    <div className="space-y-5">
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <DetailHeader
          displayTitle={displayTitle} typeLabel={typeLabel} noticeType={notice.notice_type}
          noticeId={notice.reference} visibleAgency={visibleAgency} country={notice.country || ""} sourceUrl={notice.source_url}
          publishDate={publishDate} deadlineText={deadlineText} countdown={countdown}
          budgetText={budgetText} onBack={onBack} t={t} locale={locale}
        />

        <DetailTabs activeTab={activeTab} setActiveTab={setActiveTab} t={t} />

        {/* ═══ 操作消息 ═══ */}
        {actionMessage && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 mb-5">
            {actionMessage}
          </div>
        )}

        {/* ═══ 双栏布局：左（Tab 内容）+ 右（下一步动作） ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          {/* ── 左栏：根据 activeTab 切换内容 ── */}
          <main className="min-w-0 space-y-6 pb-24 md:pb-0">
            {activeTab === "summary" && (
              <>
                <AiSummarySection
                  data={null} loading={false}
                  isUnlocked={isVip || coreUnlocked}
                  onUnlock={() => onUnlock(notice)}
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
              <PlaceholderTab
                tabType={"ai-score" as PlaceholderTabType}
                tier="pro"
                hasAccess={hasProAccess}
                upgradePath="/membership"
                noticeContext={{ country: notice.country, noticeType: notice.notice_type }}
              />
            )}

            {activeTab === "history" && (
              <PlaceholderTab
                tabType={"history" as PlaceholderTabType}
                tier="pro"
                hasAccess={hasProAccess}
                upgradePath="/membership"
                noticeContext={{ country: notice.country, noticeType: notice.notice_type }}
              />
            )}

            {activeTab === "similar" && (
              <PlaceholderTab
                tabType={"similar" as PlaceholderTabType}
                tier="free"
                hasAccess={true}
                noticeContext={{ country: notice.country, noticeType: notice.notice_type }}
              />
            )}
          </main>

          {/* ── 右栏：下一步动作面板（首屏可见） ── */}
          <NextStepsPanel
            notice={notice} isLoggedIn={isLoggedIn} isVip={isVip}
            canUsePaidQuota={canUsePaidQuota}
            onUnlock={() => onUnlock(notice)}
            onJoinCrm={() => onExpressInterest(notice, "subscribed")}
            onExpressInterest={(type) => onExpressInterest(notice, type)}
          />
        </div>
      </article>

      {/* 原有侧边栏（移动端底栏操作按钮） */}
      <NoticeDetailSidebar
        notice={notice} membership={membership}
        canUsePaidQuota={canUsePaidQuota} isVip={isVip}
        totalRemaining={totalRemaining} isLoggedIn={isLoggedIn}
        showSkeleton={showSkeleton}
        onExpressInterest={onExpressInterest}
        onUnlock={onUnlock} onPayUnlock={onPayUnlock}
      />
    </div>
  );
}
