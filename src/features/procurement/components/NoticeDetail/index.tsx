/**
 * 招标详情页 — 国内招投标信息站风格（2026-11 重设计）
 *
 * @module features/procurement/components/NoticeDetail
 * @description 只重做详情页 UI，不改动全局框架与权限判定：
 *              - 顶部面包屑 + 标题标签区 + 操作条；
 *              - 基本信息表格（字段存在性驱动：预算/行业/来源平台等缺失时整行不渲染）；
 *              - 锚点式区块导航（采购摘要/采购说明/资格条件/联系人/投标材料/AI 匹配/相似机会）；
 *              - 长正文按长度折叠（>800 字显示前 800 字 + 展开全文）；
 *              - 锁态/会员态沿用现有 coreAccessible + gates 判定，子组件各自处理锁定面板。
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, Crown, Lock, Share2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth";
import type { NoticeItem, NoticeDetailItem, MembershipStatusView } from "../../types";
import { useNoticeTranslation } from "../../hooks/useNoticeTranslation";
import { useAiAnalysis } from "../../hooks/useAiAnalysis";
import { noticeTypeKey } from "@/shared/utils/notice-type";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { NoticeDescriptionSection } from "../NoticeDescriptionSection";
import { NoticeDetailSidebar } from "../NoticeDetailSidebar";
import { AiSummarySection } from "../AiSummarySection";
import { getCountdown } from "@/shared/utils/countdown";
import { formatNoticeTs } from "@/shared/utils/notice-datetime/format";
import { toUnixMs, calendarDaysLeftCst } from "@/shared/utils/unixTs";
import { formatNoticeAmount, formatNoticeDeadline, formatNoticeDeadlineLocal, formatNoticeReference } from "../../utils/noticeDisplay";
import { industryDisplayName } from "@/shared/utils/industry-section";
import { ShareModal } from "./ShareModal";
import { QualificationTab } from "./QualificationTab";
import { BuyerContactsTab } from "./BuyerContactsTab";
import { FilesTab } from "./FilesTab";
import { SimilarTab } from "./SimilarTab";
import { AiEvaluationPanel } from "../AiEvaluationPanel";
import { useAiMatch } from "../../hooks/useAiMatch";
import { QUALIFICATION_ACCESS_BENEFIT } from "@/shared/constants/membership";

/** 区块锚点导航（id, i18n key） */
const SECTION_NAV: ReadonlyArray<readonly [string, string]> = [
  ["section-summary", "detail_tabSummary"],
  ["section-desc", "procurement_description"],
  ["section-qual", "detail_tabQualification"],
  ["section-buyer", "detail_tabBuyer"],
  ["section-files", "detail_tabMaterials"],
  ["section-ai", "detail_tabAiScore"],
  ["section-similar", "detail_tabSimilar"],
];

/** 倒计时的小时/分/秒用精确差值；「剩余 N 天」统一按日历天数，与列表一致。 */
function getDisplayCountdown(deadlineTs: number | string | null | undefined) {
  const countdown = getCountdown(deadlineTs);
  if (!countdown) return null;
  const days = calendarDaysLeftCst(toUnixMs(deadlineTs));
  if (days == null || days < 0) return null;
  return { ...countdown, days };
}

/** 长正文折叠阈值（字符数）：超过则默认折叠，展开后可读全文 */
const DESC_COLLAPSE_THRESHOLD = 800;

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
  onAccess: (notice: NoticeItem) => void;
  /** 打开另一条公告（相似机会点击跳转） */
  onOpenNotice: (notice: NoticeItem) => void;
  /** 当前公告是否已收藏 */
  favorited: boolean;
  /** 收藏/取消收藏（未登录由 hook 内部触发登录） */
  onToggleFavorite: () => void;
  /** 当前公告的详情请求是否已落地（成功/失败都算）：决定"描述是否已是终态" */
  detailSettled?: boolean;
  /** 会员状态是否已就绪（未就绪时无法判断用户能否看全文） */
  membershipReady?: boolean;
}

/** 区块标题条（国内信息站风格：左侧色条 + 灰底） */
function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
      <span className="h-3.5 w-1 rounded-sm bg-teal-600" />
      <h2 className="text-sm font-extrabold text-slate-800">{title}</h2>
      {note ? <span className="ml-auto text-[11px] font-normal text-slate-400">{note}</span> : null}
    </div>
  );
}

export function NoticeDetail({
  notice, actionMessage, membership, canUsePaidQuota, isVip,
  totalRemaining, isLoggedIn, onBack, onAccess, onOpenNotice,
  favorited, onToggleFavorite, detailSettled = false, membershipReady = true,
}: NoticeDetailProps) {
  const { t, locale } = useLocale();
  const userId = useUserId();
  const router = useRouter();
  const noticeId = notice.noticePk;
  // 档位门控（服务端按矩阵下发 gates）：notice_translation 控译文、ai_summary 控 AI 摘要。
  // free/included 才算当前用户享有；其余（upgrade/contact/access）一律回落原文。
  const gates = membership?.gates;
  // 锁定态：core_locked === false 为已解锁；notice_view 权益已包含的付费会员
  // 不再依赖单条解锁记录（服务端同样按权益放行），避免出现“权益已包含却仍显示解锁”。
  const accessIncluded = gates?.notice_view === "free" || gates?.notice_view === "included";
  const coreAccessible = notice.coreLocked === false || accessIncluded;
  // 资格条件走独立权益格（qualification_access）：matrix 给 free 打开时，
  // 即使正文仍锁定，也应直接展示资格条件（detail 只回资格字段，coreLocked=true）。
  const qualificationAccessible =
    coreAccessible ||
    notice.qualificationAccess === true ||
    gates?.[QUALIFICATION_ACCESS_BENEFIT] === "free" ||
    gates?.[QUALIFICATION_ACCESS_BENEFIT] === "included";
  const canSeeChinese = gates?.notice_translation === "free" || gates?.notice_translation === "included";
  const aiSummaryEnabled = gates?.ai_summary === "free" || gates?.ai_summary === "included";
  const aiMatchEnabled = gates?.ai_match === "free" || gates?.ai_match === "included";
  const accessPending = accessIncluded && !coreAccessible && !actionMessage;
  // ── 描述区付费口径（2026-10-30）──
  // 列表项的 description 是 SQL LEFT(description,300) 截断版，全文只由 /detail 下发。
  //   · 免费/锁定用户：拿不到全文（/detail 必 403），截断版就是终态 ⇒ 立即展示；
  //   · 付费会员/已解锁用户：最终一定拿到全文 ⇒ 全文落地前不渲染描述区，
  //     避免"先截断、后完整"的跳变；会员态还没查回来时按"可能有权限"处理
  //     （宁可晚一点出现，也不闪一次截断版；查询失败会置 ready，自然回退截断版）。
  const mayGetFullText = coreAccessible || (!membershipReady && isLoggedIn);
  const awaitingFullText = mayGetFullText && !detailSettled && !!notice.descriptionTruncated;
  // 匹配层级按会员等级差异化（数据来自 plan_catalog.commercial_tier，不硬编码档位常量）：
  // L1 个人=基础评估 / L3 企业=企业级评估 / L4+ 人工=可定制评估
  const planTier = membership?.plan?.commercialTier ?? "";
  const aiMatchLevelKey =
    planTier === "L4" || planTier === "L5" || planTier === "L6"
      ? "detail_aiMatchLevelCustom"
      : planTier === "L3"
        ? "detail_aiMatchLevelEnterprise"
        : "detail_aiMatchLevelBasic";
  const aiSummary = useAiAnalysis(noticeId, isLoggedIn, coreAccessible, aiSummaryEnabled);
  const aiMatch = useAiMatch(noticeId, aiMatchEnabled);
  // 会员「标讯权益」不限次（notice_view=-1）：打开详情即自动解锁，避免"套餐已含却提示解锁"的割裂
  // （2026-10-29 权益大一统：详情页与定价页共用同一份矩阵；解锁只是内容获取动作，会员免点）。
  const autoAccessTried = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!isLoggedIn || coreAccessible) return;
    const unlimitedAccess = gates?.notice_view === "included" || gates?.notice_view === "free";
    if (!unlimitedAccess) return;
    if (autoAccessTried.current.has(noticeId)) return;
    autoAccessTried.current.add(noticeId);
    onAccess(notice);
  }, [coreAccessible, gates, isLoggedIn, notice, noticeId, onAccess]);
  const bidDeadline = !notice.deadlineType || notice.deadlineType === "bid";
  const [countdown, setCountdown] = useState(bidDeadline ? getDisplayCountdown(notice.deadlineTs) : null);
  // 分享面板开关（链接由公告数值 id 拼成规范公开详情页）
  const [shareOpen, setShareOpen] = useState(false);
  // 长正文折叠（>800 字默认收起，展开后可读全文）
  const [descExpanded, setDescExpanded] = useState(false);

  // 倒计时每秒刷新；注册制/框架结束日不是投标截止，不显示倒计时
  useEffect(() => {
    if (!bidDeadline) {
      setCountdown(null);
      return;
    }
    const id = setInterval(() => setCountdown(getDisplayCountdown(notice.deadlineTs)), 1000);
    return () => clearInterval(id);
  }, [notice.deadlineTs, bidDeadline]);

  // 切换公告时复位长文展开态
  useEffect(() => {
    setDescExpanded(false);
  }, [notice.noticePk]);

  // 翻译：锁定态不发起请求——/translation 同属付费墙闸口（ARCH-P0 2026-09-05），
  // 锁定态发起必 403 core_locked；锁定面板标题来自列表 i18n 字段，无需译文。
  // 解锁后 core_locked 翻转为 false，钩子自动补发。
  const { translation, displayTitle: hookDisplayTitle, translating, failed, showOriginal, toggleOriginal } = useNoticeTranslation(
    coreAccessible && canSeeChinese ? notice.noticePk : undefined, locale,
    `${notice.title || ""}\n${notice.description || ""}`,
    canSeeChinese && locale === "zh" ? (notice.titleI18n || undefined) : undefined,
  );
  // 中文优先读服务表 title_cn；缺失时才走详情按需翻译，避免详情标题永远停在原文。
  const displayTitle = locale === "zh"
    ? (notice.titleCn || (canSeeChinese ? hookDisplayTitle : undefined) || notice.title)
    : notice.title;
  const displayDescription = !canSeeChinese
    ? (notice.originalDescription || notice.description)
    : showOriginal
      ? (notice.originalDescription || notice.description)
      : (locale === "zh" && notice.descriptionCn) || translation?.description || notice.description;
  const descResolved = canSeeChinese && locale === "zh" && !!notice.descriptionCn;
  const showTranslating = canSeeChinese && translating && !descResolved;
  // 切换按钮可见性：需有中文能力且有译文（API 译文 或 description_cn 直出）
  const hasTranslation = canSeeChinese && (!!translation || descResolved);
  // 长正文折叠：只在有正文且超阈值时出现「展开全文」
  const descRaw = displayDescription || "";
  const descIsLong = descRaw.length > DESC_COLLAPSE_THRESHOLD;
  const descShown = descIsLong && !descExpanded ? descRaw.slice(0, DESC_COLLAPSE_THRESHOLD) : descRaw;

  const typeKey = noticeTypeKey(notice.noticeTypeCode);
  const visibleAgency = locale === "zh"
    ? (notice.buyerNameCn || notice.buyerName || t("procurement_buyerUnavailable"))
    : (notice.buyerName || t("procurement_buyerUnavailable"));

  // 信息表数据（发布时间：源有真实时刻则到分，否则只到日，与 SEO 页同口径）
  const publishDate = notice.publishedTs ? formatNoticeTs(notice.publishedTs) : "-";
  const deadlineText = formatNoticeDeadline(
    notice.deadlineTs, notice.deadlineType, notice.deadlineTimezone, locale, t, notice.timezoneSource,
  ) || t("procurement_noDeadline");
  // 2026-11-11 口径统一：主时间一律北京时间；发标地当地时间作为补充标注（列表页不显示，避免拥挤）
  const deadlineLocal = formatNoticeDeadlineLocal(notice.deadlineTs, notice.deadlineTimezone, notice.timezoneSource);
  const deadlineDisplay = deadlineLocal ? `${deadlineText}（${deadlineLocal}）` : deadlineText;
  const budgetText = formatNoticeAmount(notice.estimatedValue, notice.currencyCode, locale);
  const typeLabel = typeKey ? t(typeKey) : notice.noticeTypeCode || "-";
  // 行业（采购主题 canonical slug）→ 采购类别标签；物表外/空值返回 null，不展示原始码
  const industryLabel = industryDisplayName(notice.industry, locale);
  // 字段存在性（数据自适应）：缺失字段整行/整块不渲染，不留空值占位
  const hasBudget = !!budgetText;
  const hasIndustry = !!industryLabel;
  const countryLabel = getCountryDisplayName(notice.countryCode || "", locale);
  const platformText = notice.platform
    ? (locale !== "zh" ? notice.platform.canonical : (notice.platform.zh || notice.platform.canonical))
    : "";
  const refText = formatNoticeReference(notice.reference, notice.noticeId) || String(noticeId);
  const refNode = notice.sourceUrl
    ? (
      <a
        href={notice.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-bold text-teal-700 underline-offset-2 hover:underline"
        title={refText}
      >
        {refText}
      </a>
    )
    : <span className="break-all font-bold text-slate-800">{refText}</span>;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const upgradeMembership = () => router.push(`/membership?notice_id=${notice.noticePk}`);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 pb-24 md:pb-2">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 transition-colors hover:text-teal-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("detail_breadcrumb")}
        </button>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">{t("detail_breadcrumbDetail")}</span>
      </nav>

      {/* 标题 + 标签 + 操作 */}
      <section className="border border-slate-200 bg-white">
        <div className="px-4 py-4 sm:px-5">
          <div className="flex items-start gap-4">
            <h1 dir="auto" className="min-w-0 flex-1 text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl">
              {displayTitle}
            </h1>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onToggleFavorite}
                className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-bold transition-colors ${
                  favorited
                    ? "border-amber-300 bg-amber-50 text-amber-600"
                    : "border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700"
                }`}
              >
                <Bookmark className={`h-3.5 w-3.5 ${favorited ? "fill-amber-500 text-amber-500" : ""}`} />
                {favorited ? t("detail_collected") : t("detail_collect")}
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition-colors hover:border-teal-400 hover:text-teal-700"
              >
                <Share2 className="h-3.5 w-3.5" />
                {t("detail_share")}
              </button>
              {!canUsePaidQuota && (
                <button
                  type="button"
                  onClick={upgradeMembership}
                  className="inline-flex h-8 items-center gap-1.5 rounded bg-amber-500 px-3 text-xs font-bold text-white transition-colors hover:bg-amber-600"
                >
                  <Crown className="h-3.5 w-3.5" />
                  {t("procurement_previewUpgradeNow")}
                </button>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="border border-teal-200 bg-teal-50 px-2 py-0.5 font-bold text-teal-700">{typeLabel}</span>
            {countryLabel ? (
              <span className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{countryLabel}</span>
            ) : null}
            {countdown ? (
              <span className="border border-rose-200 bg-rose-50 px-2 py-0.5 font-bold text-rose-600">
                {t("detail_countdownDays", { days: countdown.days })} {countdown.time}
              </span>
            ) : null}
            {platformText ? (
              <span className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                {t("detail_sourcePlatform")}：{platformText}
              </span>
            ) : null}
          </div>

        </div>
      </section>

      {/* 基本信息（字段存在性驱动） */}
      <section className="border border-slate-200 bg-white">
        <SectionHeader title={t("settingsBasicInfo")} />
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            <tr className="border-b border-slate-100">
              <th scope="row" className="w-[92px] border-r border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500 sm:w-[110px]">
                {t("detail_reference")}
              </th>
              <td className="px-3 py-2">{refNode}</td>
              <th scope="row" className="w-[92px] border-r border-l border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500 sm:w-[110px]">
                {t("detail_buyer")}
              </th>
              <td className="px-3 py-2 font-bold text-slate-800">{visibleAgency}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <th scope="row" className="border-r border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500">
                {t("detail_countryRegion")}
              </th>
              <td className="px-3 py-2 text-slate-700">{countryLabel || "-"}</td>
              <th scope="row" className="border-r border-l border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500">
                {t("detail_procurementType")}
              </th>
              <td className="px-3 py-2 text-slate-700">{typeLabel}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <th scope="row" className="border-r border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500">
                {t("detail_publishDate")}
              </th>
              <td className="px-3 py-2 text-slate-700">{publishDate}</td>
              <th scope="row" className="border-r border-l border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500">
                {t("detail_deadline")}
              </th>
              <td className="px-3 py-2 font-bold text-rose-600">{deadlineDisplay}</td>
            </tr>
            {(hasIndustry || hasBudget) && (
              <tr>
                <th scope="row" className="border-r border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500">
                  {t("supplierTabIndustry")}
                </th>
                <td className="px-3 py-2 text-slate-700">{industryLabel ?? "—"}</td>
                <th scope="row" className="border-r border-l border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500">
                  {t("detail_budgetAmount")}
                </th>
                <td className="px-3 py-2 font-bold text-teal-700">{hasBudget ? budgetText : t("procurement_budgetPending")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* 锁定态提示（免费注册用户）：会员态不渲染 */}
      {!coreAccessible && (
        <div className="flex flex-wrap items-center gap-2 border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{t("procurement_lockedCoreTitle")}</span>
          <span className="font-normal text-amber-700">{t("procurement_accessToViewFull")}</span>
          <button
            type="button"
            onClick={upgradeMembership}
            className="ml-auto rounded bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600"
          >
            {t("procurement_previewUpgradeNow")}
          </button>
        </div>
      )}

      {/* 操作消息 */}
      {actionMessage ? (
        <div className="border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800">
          {actionMessage}
        </div>
      ) : null}

      {/* 区块锚点导航 */}
      <nav className="sticky top-2 z-20 flex gap-1 overflow-x-auto border border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur">
        {SECTION_NAV.map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToSection(id)}
            className="shrink-0 rounded px-2.5 py-1 text-xs font-bold text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-700"
          >
            {t(key)}
          </button>
        ))}
      </nav>

      {/* 单栏全宽内容（长页面用顶部 sticky 锚点导航定位） */}
      <main className="min-w-0 space-y-4">
          {/* 采购摘要（AI 摘要 + 锁态提示由子组件处理） */}
          <section id="section-summary">
            <AiSummarySection
              data={aiSummary.data}
              loading={aiSummary.loading}
              streaming={aiSummary.streaming}
              error={aiSummary.error}
              llmConfigured={aiSummary.llmConfigured}
              locked={!coreAccessible}
              upgradeLocked={coreAccessible && !aiSummaryEnabled}
              accessPending={accessPending}
              masked={aiSummary.masked}
              onUpgrade={() => router.push("/membership")}
              onStart={() => aiSummary.triggerAnalysis(false)}
              onConfigure={() => router.push("/settings/ai-model")}
              onRequestAccess={() => onAccess(notice)}
              onRegenerate={() => aiSummary.triggerAnalysis(true)}
            />
          </section>

          {/* 采购说明（长文折叠 + 译文切换） */}
          {!awaitingFullText && (
            <section id="section-desc" className="border border-slate-200 bg-white">
              <SectionHeader title={t("procurement_description")} />
              <div className="px-4 py-3 sm:px-5">
                <NoticeDescriptionSection
                  translating={showTranslating}
                  failed={failed}
                  hasTranslation={hasTranslation}
                  showOriginal={showOriginal}
                  showTranslated={!showOriginal && hasTranslation}
                  toggleOriginal={toggleOriginal}
                  displayDescription={descShown}
                  descriptionTruncated={descIsLong && !descExpanded ? true : !!notice.descriptionTruncated}
                />
                {descIsLong && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-3 inline-flex items-center gap-1 border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-100"
                  >
                    {descExpanded ? t("detail_collapse") : t("detail_expand")}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* 资格条件（会员态结构化 / 锁态锁定面板由子组件处理） */}
          <section id="section-qual">
            <QualificationTab
              notice={notice}
              coreAccessible={coreAccessible}
              qualificationAccessible={qualificationAccessible}
              isVip={isVip}
            />
          </section>

          {/* 联系人 */}
          <section id="section-buyer">
            <BuyerContactsTab notice={notice} coreAccessible={coreAccessible} />
          </section>

          {/* 投标材料 */}
          <section id="section-files">
            <FilesTab notice={notice} coreAccessible={coreAccessible} isVip={isVip} userId={userId} onAccess={onAccess} gates={membership?.gates} />
          </section>

          {/* AI 智能匹配 */}
          <section id="section-ai" className="space-y-2">
            {aiMatchEnabled && (
              <p className="text-xs font-bold text-slate-500" data-testid="ai-match-level">
                {t(aiMatchLevelKey)}
              </p>
            )}
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
          </section>

          {/* 相似机会 */}
          <section id="section-similar">
            <SimilarTab notice={notice} onOpen={onOpenNotice} />
          </section>
        </main>


      {/* 移动端底栏操作（保持现有组件） */}
      <NoticeDetailSidebar
        notice={notice}
        membership={membership}
        canUsePaidQuota={canUsePaidQuota}
        isVip={isVip}
        totalRemaining={totalRemaining}
        isLoggedIn={isLoggedIn}
      />

      {/* 分享面板：链接直达规范公开详情页 /procurement/notice/{id} */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        noticeId={noticeId}
        title={displayTitle}
        description={String(notice.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80)}
      />
    </div>
  );
}
