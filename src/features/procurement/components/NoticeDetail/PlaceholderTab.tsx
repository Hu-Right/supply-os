/**
 * Tab 占位内容组件（AI评分 / 历史中标 / 相似机会）
 * Placeholder Tab Content
 *
 * @module features/procurement/components/NoticeDetail/PlaceholderTab
 * @description 为尚未接入后端数据的 Tab 提供差异化占位展示。
 *              每个 Tab 类型有独立的图标配色、引导文案和功能预览卡片，
 *              根据 notice 数据动态生成上下文相关信息。
 */
import type { LucideIcon } from "lucide-react";
import { Lock, Crown, Sparkles, TrendingUp, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";

export type PlaceholderTabType = "ai-score" | "history" | "similar";

export interface PlaceholderTabProps {
  /** Tab 类型（决定文案和视觉） */
  tabType: PlaceholderTabType;
  /** 权益层级 */
  tier: "free" | "member" | "pro";
  /** 是否已满足该层级权益 */
  hasAccess: boolean;
  /** 升级跳转路径（无权限时） */
  upgradePath?: string;
  /** 公告数据（用于生成上下文文案） */
  noticeContext?: {
    country?: string;
    noticeType?: string;
    industry?: string;
    locale?: string;
  };
}

interface TabConfig {
  icon: LucideIcon;
  iconBg: string;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
  /** 功能预览卡片（展示即将上线的功能点） */
  features: { icon: LucideIcon; labelKey: string; labelDefault: string }[];
  /** 无权限时的行动文案 */
  lockedActionKey: string;
  lockedActionDefault: string;
}

const TAB_CONFIGS: Record<PlaceholderTabType, TabConfig> = {
  "ai-score": {
    icon: Target,
    iconBg: "bg-purple-100",
    titleKey: "detail_tabAiScore",
    titleDefault: "AI适配评分",
    descKey: "detail_aiScoreDesc",
    descDefault: "AI 将根据贵司资质与本标要求进行多维度匹配评分，帮助您快速判断投标可行性。",
    features: [
      { icon: Target, labelKey: "detail_aiFeat1", labelDefault: "资质匹配度分析" },
      { icon: TrendingUp, labelKey: "detail_aiFeat2", labelDefault: "中标概率评估" },
      { icon: Sparkles, labelKey: "detail_aiFeat3", labelDefault: "竞争优势与建议" },
    ],
    lockedActionKey: "detail_aiScoreLocked",
    lockedActionDefault: "升级专业版，获取 AI 适配评分",
  },
  history: {
    icon: TrendingUp,
    iconBg: "bg-blue-100",
    titleKey: "detail_tabHistory",
    titleDefault: "历史中标",
    descKey: "detail_historyDesc",
    descDefault: "展示同类项目历史中标数据，包括中标金额、中标企业、竞争态势分析。",
    features: [
      { icon: TrendingUp, labelKey: "detail_histFeat1", labelDefault: "同类项目中标金额趋势" },
      { icon: Target, labelKey: "detail_histFeat2", labelDefault: "主要中标企业画像" },
      { icon: Sparkles, labelKey: "detail_histFeat3", labelDefault: "竞争态势与策略建议" },
    ],
    lockedActionKey: "detail_historyLocked",
    lockedActionDefault: "升级专业版，查看历史中标数据",
  },
  similar: {
    icon: Sparkles,
    iconBg: "bg-teal-100",
    titleKey: "detail_tabSimilar",
    titleDefault: "相似机会",
    descKey: "detail_similarDesc",
    descDefault: "根据您的行业偏好与历史行为，推荐相似采购公告。",
    features: [
      { icon: Target, labelKey: "detail_simFeat1", labelDefault: "同行业采购公告推荐" },
      { icon: TrendingUp, labelKey: "detail_simFeat2", labelDefault: "同地区机会发现" },
      { icon: Sparkles, labelKey: "detail_simFeat3", labelDefault: "智能匹配度排序" },
    ],
    lockedActionKey: "detail_similarLocked",
    lockedActionDefault: "功能即将上线，敬请期待",
  },
};

const TIER_STYLES = {
  free: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", label: "detail_free" },
  member: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "detail_member" },
  pro: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", label: "detail_pro" },
};

export function PlaceholderTab({
  tabType,
  tier,
  hasAccess,
  upgradePath,
  noticeContext,
}: PlaceholderTabProps) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const config = TAB_CONFIGS[tabType];
  const tierStyle = TIER_STYLES[tier];
  const Icon = config.icon;

  // 根据公告上下文生成个性化提示
  const contextHint = noticeContext?.country
    ? `${getCountryDisplayName(noticeContext.country, locale || "zh")}${noticeContext.noticeType ? ` · ${noticeContext.noticeType}` : ""}`
    : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* 顶部：图标 + 标题 + 层级标识 */}
      <div className="p-6 text-center border-b border-slate-100">
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${config.iconBg} mb-3`}>
          <Icon className="w-7 h-7 text-slate-600" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 mb-1">
          {t(config.titleKey) || config.titleDefault}
        </h3>
        <span className={`inline-block px-2 py-0.5 rounded text-2xs font-bold border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
          {t(tierStyle.label)}
        </span>
        {contextHint && (
          <p className="text-xs text-slate-400 mt-2">
            当前公告：{contextHint}
          </p>
        )}
      </div>

      {/* 功能预览卡片 */}
      <div className="p-5">
        <p className="text-xs font-bold text-slate-500 uppercase mb-3 text-center">
          {hasAccess ? "即将上线的功能" : "升级后可解锁"}
        </p>
        <div className="space-y-2">
          {config.features.map((feat, i) => {
            const FeatIcon = feat.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
              >
                <div className="shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                  <FeatIcon className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-sm font-bold text-slate-700">
                  {t(feat.labelKey) || feat.labelDefault}
                </span>
                {hasAccess && (
                  <span className="ml-auto text-2xs text-slate-400 font-mono">Soon</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 说明文案 */}
        <p className="text-xs text-slate-500 mt-4 text-center leading-5">
          {t(config.descKey) || config.descDefault}
        </p>

        {/* 行动按钮 */}
        {!hasAccess && upgradePath && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => router.push(upgradePath)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-sm font-bold transition-colors"
            >
              {tier === "pro" ? <Crown className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {t(config.lockedActionKey) || config.lockedActionDefault}
            </button>
          </div>
        )}

        {hasAccess && (
          <div className="mt-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-100 rounded-full px-3 py-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {t("procurement_comingSoon") || "功能开发中，敬请期待"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
