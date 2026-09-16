/**
 * Tab 占位内容组件（AI评分 / 历史中标 / 相似机会）
 * Placeholder Tab Content
 *
 * @module features/procurement/components/NoticeDetail/PlaceholderTab
 * @description 为尚未接入后端数据的 Tab 提供统一的占位展示：
 *              图标 + 标题 + 说明文案 + 权益层级标识。
 */
import type { LucideIcon } from "lucide-react";
import { Lock, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";

export interface PlaceholderTabProps {
  /** Tab 图标 */
  icon: LucideIcon;
  /** Tab 标题 i18n key */
  titleKey: string;
  /** Tab 标题默认文案 */
  titleDefault: string;
  /** 说明文案 i18n key */
  descKey: string;
  /** 说明文案默认内容 */
  descDefault: string;
  /** 权益层级 */
  tier: "free" | "member" | "pro";
  /** 是否已满足该层级权益 */
  hasAccess: boolean;
  /** 升级跳转路径（无权限时） */
  upgradePath?: string;
}

const TIER_STYLES = {
  free: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", label: "detail_free" },
  member: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "detail_member" },
  pro: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", label: "detail_pro" },
};

export function PlaceholderTab({
  icon: Icon,
  titleKey,
  titleDefault,
  descKey,
  descDefault,
  tier,
  hasAccess,
  upgradePath,
}: PlaceholderTabProps) {
  const { t } = useLocale();
  const router = useRouter();
  const tierStyle = TIER_STYLES[tier];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="text-base font-extrabold text-slate-900 mb-1">
        {t(titleKey) || titleDefault}
      </h3>
      <span className={`inline-block px-2 py-0.5 rounded text-2xs font-bold border mb-3 ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
        {t(tierStyle.label)}
      </span>
      <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
        {t(descKey) || descDefault}
      </p>

      {!hasAccess && upgradePath && (
        <button
          type="button"
          onClick={() => router.push(upgradePath)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-sm font-bold transition-colors"
        >
          {tier === "pro" ? <Crown className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {t("detail_upgradeUnlock") || "升级解锁"}
        </button>
      )}

      {hasAccess && (
        <p className="text-xs text-slate-400">
          {t("procurement_comingSoon") || "功能开发中，敬请期待"}
        </p>
      )}
    </section>
  );
}
