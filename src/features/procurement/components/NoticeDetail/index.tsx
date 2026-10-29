/**
 * 招标详情页（模块03 设计图还原）— 拆分后主入口
 * Notice Detail Page — Module 03 Design Mockup
 *
 * @module features/procurement/components/NoticeDetail
 * @description 按「3-招标详情页」样图重排：面包屑 + 标题标签区 + 9列信息速览表 +
 *              Tab 导航 + 双栏布局（左：AI摘要/概况速览，右：下一步动作面板）。
 *              免费用户可判断价值，付费用户获取完整执行信息。
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth";
import type { NoticeItem, NoticeDetailItem, MembershipStatusView } from "../../types";
import { useNoticeTranslation } from "../../hooks/useNoticeTranslation";
import { useAiAnalysis } from "../../hooks/useAiAnalysis";
import { noticeTypeKey } from "@/shared/utils/notice-type";
import { collectBreakdownFiles } from "./utils";

import { NoticeDescriptionSection } from "../NoticeDescriptionSection";

import { NoticeCoreContent } from "../NoticeCoreContent";
import { NoticeDetailSidebar } from "../NoticeDetailSidebar";

import { AiSummarySection } from "../AiSummarySection";
import { NextStepsPanel } from "../NextStepsPanel";
import { getCountdown } from "@/shared/utils/countdown";
import { formatNoticeDateOrNull } from "@/shared/utils/notice-datetime/format";
import { toUnixMs, calendarDaysLeftCst } from "@/shared/utils/unixTs";
import { formatNoticeAmount, formatNoticeDeadline, formatNoticeReference } from "../../utils/noticeDisplay";

import { DetailHeader } from "./DetailHeader";
import { DetailTabs } from "./DetailTabs";
import { ShareModal } from "./ShareModal";
import { tabPanelId, tabTriggerId } from "./utils";
import { QualificationTab } from "./QualificationTab";
import { BuyerContactsTab } from "./BuyerContactsTab";
import { FilesTab } from "./FilesTab";
import { SimilarTab } from "./SimilarTab";
import { AiEvaluationPanel } from "../AiEvaluationPanel";
import { useAiMatch } from "../../hooks/useAiMatch";

/** 倒计时的小时/分/秒用精确差值；「剩余 N 天」统一按日历天数，与列表一致。 */
function getDisplayCountdown(deadlineTs: number | string | null | undefined) {
  const countdown = getCountdown(deadlineTs);
  if (!countdown) return null;
  const days = calendarDaysLeftCst(toUnixMs(deadlineTs));
  if (days == null || days < 0) return null;
  return { ...countdown, days };
}

interface NoticeDetailProps {
  notice: NoticeDetailItem;
  actionMessage: string;
  membership: MembershipStatusView | null;
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
  const userId = useUserId();
  const router = useRouter();
  const noticeId = notice.noticePk;
  // 锁定态：core_locked === false 为已解锁（列表标记或 /detail 合并结果）。
  // 上移至 hooks 之前：AI 摘要与翻译一致，锁定态不发请求/不开放"开始分析"（后端必 403 core_locked）。
  const coreUnlocked = notice.coreLocked === false;
  // 档位中文能力（服务端按矩阵下发 gates）：notice_translation 控译文、ai_summary 控 AI 摘要。
  // free/included 才算当前用户享有；其余（upgrade/contact/unlock）一律回落原文。
  const gates = membership?.gates;
  const canSeeChinese = gates?.notice_translation === "free" || gates?.notice_translation === "included";
  const aiSummaryEnabled = gates?.ai_summary === "free" || gates?.ai_summary === "included";
  const aiMatchEnabled = gates?.ai_match === "free" || gates?.ai_match === "included";
  const aiSummary = useAiAnalysis(noticeId, isLoggedIn, coreUnlocked, aiSummaryEnabled);
  const aiMatch = useAiMatch(noticeId, aiMatchEnabled);
  // 会员「标讯权益」不限次（notice_view=-1）：打开详情即自动解锁，避免"套餐已含却提示解锁"的割裂
  // （2026-10-29 权益大一统：详情页 Tab 与定价页共用同一份矩阵；解锁只是内容获取动作，会员免点）。
  // 每个 notice 只尝试一次，失败不重试，用户仍可手动点解锁。
  const autoUnlockTried = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!isLoggedIn || coreUnlocked) return;
    const unlimitedAccess = gates?.notice_view === "included" || gates?.notice_view === "free";
    if (!unlimitedAccess) return;
    if (autoUnlockTried.current.has(noticeId)) return;
    autoUnlockTried.current.add(noticeId);
    onUnlock(notice);
  }, [coreUnlocked, gates, isLoggedIn, notice, noticeId, onUnlock]);
  const [activeTab, setActiveTab] = useState("summary");
  const bidDeadline = !notice.deadlineType || notice.deadlineType === "bid";
  const [countdown, setCountdown] = useState(bidDeadline ? getDisplayCountdown(notice.deadlineTs) : null);
  // 分享面板开关（链接由公告数值 id 拼成规范公开详情页）
  const [shareOpen, setShareOpen] = useState(false);

  // 倒计时每秒刷新；注册制/框架结束日不是投标截止，不显示倒计时
  useEffect(() => {
    if (!bidDeadline) {
      setCountdown(null);
      return;
    }
    const id = setInterval(() => setCountdown(getDisplayCountdown(notice.deadlineTs)), 1000);
    return () => clearInterval(id);
  }, [notice.deadlineTs, bidDeadline]);

  // 切换到另一条公告（如相似机会跳转）时回到概况 Tab
  useEffect(() => {
    setActiveTab("summary");
  }, [notice.noticePk]);

  // 翻译：锁定态不发起请求——/translation 同属付费墙闸口（ARCH-P0 2026-09-05），
  // 锁定态发起必 403 core_locked；锁定面板标题来自列表 i18n 字段，无需译文。
  // 解锁后 core_locked 翻转为 false，钩子自动补发。
  const { translation, translating, failed, showOriginal, toggleOriginal } = useNoticeTranslation(
    coreUnlocked && canSeeChinese ? notice.noticePk : undefined, locale,
    `${notice.title || ""}\n${notice.description || ""}`,
    canSeeChinese && locale === "zh" ? (notice.titleI18n || undefined) : undefined,
  );
  // 中文标题走服务表 title_cn 缓存，其他环境一律原文
  const displayTitle = locale === "zh" ? (notice.titleCn || notice.title) : notice.title;
  const displayDescription = !canSeeChinese
    ? (notice.originalDescription || notice.description)
    : showOriginal
      ? (notice.originalDescription || notice.description)
      : (locale === "zh" && notice.descriptionCn) || translation?.description || notice.description;
  const descResolved = canSeeChinese && locale === "zh" && !!notice.descriptionCn;
  const showTranslating = canSeeChinese && translating && !descResolved;
  // 切换按钮可见性：需有中文能力且有译文（API 译文 或 description_cn 直出）
  const hasTranslation = canSeeChinese && (!!translation || descResolved);

  // 锁定态展示项
  const showSkeleton = !coreUnlocked && !!detailLoading;
  const breakdownFileCount = coreUnlocked
    ? collectBreakdownFiles(notice).length
    : typeof notice.breakdownFileCount === "number" ? notice.breakdownFileCount : undefined;

  const typeKey = noticeTypeKey(notice.noticeTypeCode);
  const visibleAgency = locale === "zh"
    ? (notice.buyerNameCn || notice.buyerName || t("procurement_unknownAgency"))
    : (notice.buyerName || t("procurement_unknownAgency"));

  // 信息表数据（发布日走统一解析+UTC 格式化，与 SEO 页同口径；不可解析回落占位）
  const publishDate = formatNoticeDateOrNull(notice.publishedTs ? new Date(Number(notice.publishedTs) * 1000).toISOString().slice(0, 10) : "") || "-";
  const deadlineText = formatNoticeDeadline(
    notice.deadlineTs, notice.deadlineType, notice.deadlineTimezone, locale, t,
  ) || t("procurement_noDeadline");
  const budgetText = formatNoticeAmount(notice.estimatedValue, notice.currencyCode, locale) || t("procurement_budgetPending");
  const typeLabel = typeKey ? t(typeKey) : notice.noticeTypeCode || "-";

  return (
    <div className="space-y-5">
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <DetailHeader
          displayTitle={displayTitle} typeLabel={typeLabel}
          // 公告编号：来源方真实标号（reference）优先；来源没给编号时（如 JP-GP 这类
          // 门户原文只有路径、爬虫不落 reference）回退平台编号 noticeId，绝不显示 URL 路径
          noticeId={formatNoticeReference(notice.reference, notice.noticeId) || undefined} visibleAgency={visibleAgency} country={notice.countryCode || ""} sourceUrl={notice.sourceUrl || undefined} platform={notice.platform ?? null}
          publishDate={publishDate} deadlineText={deadlineText} countdown={countdown}
          budgetText={budgetText} onBack={onBack} t={t} locale={locale}
          favorited={favorited} onToggleFavorite={onToggleFavorite}
          onShare={() => setShareOpen(true)}
        />

        <DetailTabs activeTab={activeTab} setActiveTab={setActiveTab} t={t} gates={membership?.gates} />

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
                  masked={aiSummary.masked}
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
                  displayDescription={displayDescription || ""}
                  descriptionTruncated={!!notice.descriptionTruncated}
                />

                {/* 解锁态：采购方/联系人 → 「采购方与联系人」Tab；报告/文件 → 「投标材料」Tab。
                    这里只保留锁定态的渐进预览（无敏感内容）。 */}
                <NoticeCoreContent
                  notice={notice} coreUnlocked={coreUnlocked}
                  showSkeleton={showSkeleton} breakdownFileCount={breakdownFileCount}
                />
              </>
            )}

            {activeTab === "qualification" && (
              <QualificationTab notice={notice} coreUnlocked={coreUnlocked} isVip={isVip} />
            )}

            {activeTab === "buyer" && (
              <BuyerContactsTab notice={notice} coreUnlocked={coreUnlocked} />
            )}

            {activeTab === "files" && (
              <FilesTab notice={notice} coreUnlocked={coreUnlocked} isVip={isVip} userId={userId} onUnlock={onUnlock} />
            )}

            {activeTab === "ai-score" && (
              <AiEvaluationPanel
                data={aiMatch.data}
                loading={aiMatch.loading}
                cacheLoading={aiMatch.cacheLoading}
                error={aiMatch.error}
                upgradeLocked={!aiMatchEnabled}
                onStart={() => aiMatch.triggerMatch(false)}
                onRegenerate={() => aiMatch.triggerMatch(true)}
                onGoToPool={() => router.push("/settings/supplier-pool")}
                onGoToEnterprise={() => router.push("/settings/enterprise")}
                onEditDiag={() => router.push("/settings/supplier-pool")}
              />
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
              gates={membership?.gates}
              coreUnlocked={coreUnlocked}
              onUnlock={() => onUnlock(notice)}
              onViewFiles={() => setActiveTab("files")}
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
      />

      {/* 分享面板：链接直达规范公开详情页 /procurement/notice/{id} */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        noticeId={noticeId}
        title={displayTitle}
      />
    </div>
  );
}







