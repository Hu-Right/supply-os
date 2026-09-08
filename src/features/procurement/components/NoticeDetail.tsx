/**
 * 招标详情页（模块03 设计图还原）
 * Notice Detail Page — Module 03 Design Mockup
 *
 * @module features/procurement/components/NoticeDetail
 * @description 按「3-招标详情页」样图重排：面包屑 + 标题标签区 + 8列信息速览表 +
 *              Tab 导航 + 双栏布局（左：AI摘要/概况速览，右：下一步动作面板）。
 *              免费用户可判断价值，付费用户获取完整执行信息。
 */
import { useState, useEffect } from "react";
import {
  ArrowLeft, Bookmark, Share2, Clock,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useOptionalAuth, useUserId } from "@/core/auth";
import type { NoticeItem, NoticeDetailItem, MembershipStatus } from "../types";
import { useNoticeTranslation } from "../hooks/useNoticeTranslation";
import { noticeTypeKey } from "../notice-type";
import { collectBreakdownFiles } from "./NoticeUnlockedDetails";
import { ReportUnavailableBanner } from "./ReportUnavailableBanner";
import { NoticeDescriptionSection } from "./NoticeDescriptionSection";
import { NoticeBreakdownIndicator } from "./NoticeBreakdownIndicator";
import { NoticeCoreContent } from "./NoticeCoreContent";
import { NoticeDetailSidebar } from "./NoticeDetailSidebar";
import { ReportPreviewPanel } from "./ReportPreviewPanel";
import { AiSummarySection } from "./AiSummarySection";
import { NextStepsPanel } from "./NextStepsPanel";
import { getCountryDisplayName } from "@/shared/data/countryNames";

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

/** Tab 定义 */
interface DetailTab {
  key: string;
  labelKey: string;
  tier: "free" | "member" | "pro";
  tierLabelKey: string;
}

const DETAIL_TABS: DetailTab[] = [
  { key: "summary", labelKey: "detail_tabSummary", tier: "free", tierLabelKey: "detail_free" },
  { key: "qualification", labelKey: "detail_tabQualification", tier: "member", tierLabelKey: "detail_member" },
  { key: "files", labelKey: "detail_tabOriginalFiles", tier: "member", tierLabelKey: "detail_member" },
  { key: "ai-score", labelKey: "detail_tabAiScore", tier: "pro", tierLabelKey: "detail_pro" },
  { key: "history", labelKey: "detail_tabHistory", tier: "pro", tierLabelKey: "detail_pro" },
  { key: "similar", labelKey: "detail_tabSimilar", tier: "free", tierLabelKey: "detail_free" },
];

const TIER_BADGE_STYLE: Record<string, string> = {
  free: "bg-teal-50 text-teal-700 border-teal-200",
  member: "bg-amber-50 text-amber-700 border-amber-200",
  pro: "bg-purple-50 text-purple-700 border-purple-200",
};

/** 从 source_url 提取来源平台名称 */
function deriveSourceName(sourceUrl?: string): string {
  if (!sourceUrl) return "";
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    const map: Record<string, string> = {
      "ungm.org": "UNGM", "etimad.sa": "Etimad", "gem.gov.in": "GeM",
      "compranet.gob.mx": "Compranet", "nupco.com": "NUPCO", "sam.gov": "SAM.gov",
      "ted.europa.eu": "TED", "undp.org": "UNDP", "seha.ae": "SEHA",
    };
    for (const [domain, name] of Object.entries(map)) {
      if (host.includes(domain)) return name;
    }
    return host.split(".")[0].toUpperCase();
  } catch { return ""; }
}

/** 计算截止倒计时（按北京时间 CST UTC+8） */
function getCountdown(deadlineTs?: number | string): { days: number; time: string } | null {
  if (!deadlineTs) return null;
  const ms = typeof deadlineTs === "number"
    ? (deadlineTs > 1e12 ? deadlineTs : deadlineTs * 1000)
    : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const CST_OFFSET = 8 * 3600000;
  const deadlineCst = new Date(ms + CST_OFFSET);
  const nowCst = new Date(Date.now() + CST_OFFSET);
  const diff = deadlineCst.getTime() - nowCst.getTime();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return { days, time: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` };
}

/** 格式化发布时间 */
function formatPublishDate(createTime?: string | number): string {
  if (!createTime) return "-";
  try {
    // 处理 Unix 时间戳（秒级）
    if (typeof createTime === "number") {
      if (createTime < 946684800) return "-"; // 2000年之前的视为无效
      return new Date(createTime * 1000).toISOString().slice(0, 10);
    }
    // 处理日期字符串
    const date = new Date(createTime);
    if (date.getFullYear() < 2000) return "-"; // 2000年之前的视为无效
    return date.toISOString().slice(0, 10);
  } catch { return "-"; }
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
    ? notice.description
    : (locale === "zh" && notice.description_cn) || translation?.description || notice.description;
  const descResolved = locale === "zh" && !!notice.description_cn;
  const showTranslating = translating && !descResolved;

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
  const sourceName = deriveSourceName(notice.source_url);
  const publishDate = formatPublishDate(notice.create_time);
  const deadlineText = notice.deadline || t("procurement_noDeadline");
  const budgetText = notice.estimated_value || t("procurement_budgetPending");
  const typeLabel = typeKey ? t(typeKey) : notice.notice_type || "-";

  return (
    <div className="space-y-5">
      {/* ═══ 面包屑 ══ */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <button onClick={onBack} className="hover:text-teal-700 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("detail_breadcrumb")}
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-medium">{t("detail_breadcrumbDetail")}</span>
      </nav>

      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        {/* ═══ 标题区 ══ */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div className="min-w-0 flex-1">
            <h3 dir="auto" className="text-2xl md:text-3xl font-extrabold text-slate-950 leading-tight">
              {displayTitle}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {/* 采购类型标签 */}
              <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
                {typeLabel}
              </span>
              {/* 行业标签（从 UNSPSC 或 notice_type 推导） */}
              {notice.notice_type && (
                <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                  {t("detail_medical")}
                </span>
              )}
            </div>
          </div>
          {/* 操作按钮 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => alert(t("procurement_comingSoon"))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-400 hover:text-teal-700 transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" />
              {t("detail_collect")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: displayTitle, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  alert("链接已复制");
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-400 hover:text-teal-700 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              {t("detail_share")}
            </button>
          </div>
        </div>

        {/* ═══ 8列信息速览表 ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 p-4 rounded-xl bg-slate-50/70 border border-slate-100">
          {[
            [t("detail_buyer"), visibleAgency],
            [t("detail_countryRegion"), getCountryDisplayName(notice.country || "", locale) || t("procurement_global")],
            [t("detail_sourcePlatform"), sourceName || t("detail_sourceOfficial")],
            [t("detail_publishDate"), publishDate],
            [t("detail_deadline"), deadlineText],
            [t("detail_countdown"), countdown
              ? <span className="text-rose-600 font-bold font-mono">{countdown.days}天 {countdown.time}</span>
              : t("procurement_noDeadline")],
            [t("detail_procurementType"), typeLabel],
            [t("detail_budgetAmount"),
              <span className="text-teal-700 font-extrabold">{budgetText}</span>],
          ].map(([label, value]) => (
            <div key={label as string} className="min-w-0">
              <p className="text-2xs font-bold text-slate-400 uppercase mb-1 truncate">{label as string}</p>
              <p className="text-xs font-bold text-slate-800 break-words leading-snug">{value as React.ReactNode}</p>
            </div>
          ))}
        </div>

        {/* ═══ Tab 导航 ═══ */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 mb-6">
          {DETAIL_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors ${
                  isActive
                    ? "bg-teal-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-teal-300 hover:text-teal-700"
                }`}
              >
                {t(tab.labelKey)}
                <span className={`px-1.5 py-0.5 rounded text-2xs font-bold border ${TIER_BADGE_STYLE[tab.tier]}`}>
                  {t(tab.tierLabelKey)}
                </span>
              </button>
            );
          })}
        </div>

        {/* ═══ 操作消息 ═══ */}
        {actionMessage && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 mb-5">
            {actionMessage}
          </div>
        )}

        {/* ═══ 双栏布局：左（AI摘要 + 内容）+ 右（下一步动作） ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          {/* ── 左栏 ── */}
          <main className="min-w-0 space-y-6 pb-24 md:pb-0">
            {/* AI 拆标摘要区 */}
            <AiSummarySection
              data={null}
              loading={false}
              isUnlocked={isVip || coreUnlocked}
              onUnlock={() => onUnlock(notice)}
            />

            {/* 描述区 */}
            <NoticeDescriptionSection
              translating={showTranslating}
              failed={failed}
              hasTranslation={!!translation}
              showOriginal={showOriginal}
              showTranslated={!showOriginal && !!translation}
              toggleOriginal={toggleOriginal}
              displayDescription={displayDescription}
            />

            {/* 拆解文件指示器 */}
            {!showSkeleton && (
              <NoticeBreakdownIndicator
                hasReport={hasReport}
                reportKnown={reportKnown}
                breakdownFileCount={breakdownFileCount}
              />
            )}

            {/* 报告不可用引导 */}
            {showReportGuide && notice.id != null && (
              <ReportUnavailableBanner
                noticeId={notice.id}
                isVip={isVip}
                isLoggedIn={!!authContext?.authUser}
              />
            )}

            {/* 报告预览 */}
            {notice.id != null && userId && reportKnown && hasReport && (
              <ReportPreviewPanel
                noticeId={notice.id}
                userId={userId}
                isVip={isVip}
                onUnlock={onUnlock}
                coreLocked={!coreUnlocked}
              />
            )}

            {/* 核心内容 */}
            <NoticeCoreContent
              notice={notice}
              coreUnlocked={coreUnlocked}
              showSkeleton={showSkeleton}
              breakdownFileCount={breakdownFileCount}
            />
          </main>

          {/* ── 右栏：下一步动作面板（首屏可见） ── */}
          <NextStepsPanel
            notice={notice}
            isLoggedIn={isLoggedIn}
            isVip={isVip}
            canUsePaidQuota={canUsePaidQuota}
            onUnlock={() => onUnlock(notice)}
            onJoinCrm={() => onExpressInterest(notice, "subscribed")}
            onExpressInterest={(type) => onExpressInterest(notice, type)}
          />
        </div>
      </article>

      {/* 原有侧边栏（移动端底栏操作按钮） */}
      <NoticeDetailSidebar
        notice={notice}
        membership={membership}
        canUsePaidQuota={canUsePaidQuota}
        isVip={isVip}
        totalRemaining={totalRemaining}
        isLoggedIn={isLoggedIn}
        showSkeleton={showSkeleton}
        onExpressInterest={onExpressInterest}
        onUnlock={onUnlock}
        onPayUnlock={onPayUnlock}
      />
    </div>
  );
}
