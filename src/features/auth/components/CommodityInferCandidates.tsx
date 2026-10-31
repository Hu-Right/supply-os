/**
 * 品目智能推断候选列表（UGT 树内匹配）
 * Commodity Smart Inference Candidate List
 *
 * @module features/auth/components/CommodityInferCandidates
 * @description 主营业务智能推断的候选确认 UI：按匹配分展示树内命中的节点，
 *              由用户显式点选后回填级联——替代旧版静默自动填充，
 *              避免低置信推断把用户行业偏好锁定到错误分支。
 *              取代旧字典版组件（读旧品类字典，随字典退役下线）。
 */
import type { CommodityInferCandidate } from "@/core/api/industry-prefs";
import { useLocale } from "@/core/i18n";
import { Badge, type BadgeVariant } from "@/shared/ui";

export interface CommodityInferCandidatesProps {
  candidates: CommodityInferCandidate[];
  /** 当前已应用到级联的候选节点码（高亮显示） */
  appliedCode: string | null;
  /** 多个候选时的引导文案 */
  hint: string;
  onPick: (candidate: CommodityInferCandidate) => void;
}

/** 匹配分徽章：>= 0.8 高 / >= 0.6 中 / 其余低（2026-10-31 徽章统一：cls 改 Badge soft 变体） */
function scoreBadgeKey(score: number): { key: "authInferScoreHigh" | "authInferScoreMedium" | "authInferScoreLow"; cls: BadgeVariant } {
  if (score >= 0.8) return { key: "authInferScoreHigh", cls: "soft-success" };
  if (score >= 0.6) return { key: "authInferScoreMedium", cls: "soft-info" };
  return { key: "authInferScoreLow", cls: "soft-warning" };
}

export function CommodityInferCandidates({ candidates, appliedCode, hint, onPick }: CommodityInferCandidatesProps) {
  const { t, locale } = useLocale();
  if (candidates.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] text-slate-500 mb-1.5">{hint}</p>
      <div className="flex flex-col gap-1.5">
        {candidates.map((c) => {
          const badge = scoreBadgeKey(c.score);
          const applied = c.code === appliedCode;
          const label = (locale === "zh" ? c.nameZh : c.nameEn) || c.nameZh || c.nameEn || c.code;
          // 面包屑只显祖先（去掉链尾自身）：L2 候选显其 L1 大类，自身名已由 label 展示
          const parentPath = (c.path ?? []).slice(0, -1).join(" › ");
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onPick(c)}
              className={`flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                applied
                  ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500"
                  : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className={`block font-bold truncate ${applied ? "text-teal-700" : "text-slate-700"}`}>
                  {label}
                </span>
                {parentPath && (
                  <span className="block text-[10px] text-slate-400 truncate" title={parentPath}>
                    {parentPath}
                  </span>
                )}
              </span>
              <Badge shape="pill" variant={badge.cls} className="shrink-0 px-1.5 py-0.5 text-[10px] font-black">
                {t(badge.key)}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
