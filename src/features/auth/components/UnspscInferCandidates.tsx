/**
 * UNSPSC 智能推断候选列表
 * UNSPSC Smart Inference Candidate List
 *
 * @module features/auth/components/UnspscInferCandidates
 * @description 主营业务智能推断的候选确认 UI：按置信度展示匹配到的类目，
 *              由用户显式点选后回填级联——替代旧版静默自动填充，
 *              避免低置信推断把用户行业偏好锁定到错误分支。
 */
import type { SmartInferCandidate } from "@/core/unspsc";
import { useLocale } from "@/core/i18n";

export interface UnspscInferCandidatesProps {
  candidates: SmartInferCandidate[];
  /** 当前已应用到级联的候选节点 id（高亮显示） */
  appliedNodeId: number | null;
  /** 多个候选时的引导文案（单个高置信自动应用时为确认文案） */
  hint: string;
  onPick: (candidate: SmartInferCandidate) => void;
}

/** 置信度徽章：>= 0.8 高 / >= 0.6 中 / 其余低（低置信后端不会给出自动填充解） */
function scoreBadgeKey(score: number): { key: "authInferScoreHigh" | "authInferScoreMedium" | "authInferScoreLow"; cls: string } {
  if (score >= 0.8) return { key: "authInferScoreHigh", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 0.6) return { key: "authInferScoreMedium", cls: "text-teal-700 bg-teal-50 border-teal-200" };
  return { key: "authInferScoreLow", cls: "text-amber-700 bg-amber-50 border-amber-200" };
}

export function UnspscInferCandidates({ candidates, appliedNodeId, hint, onPick }: UnspscInferCandidatesProps) {
  const { t } = useLocale();
  if (candidates.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] text-slate-500 mb-1.5">{hint}</p>
      <div className="flex flex-col gap-1.5">
        {candidates.map((c) => {
          const badge = scoreBadgeKey(c.score);
          const applied = c.node_id === appliedNodeId;
          return (
            <button
              key={c.node_id}
              type="button"
              onClick={() => onPick(c)}
              className={`flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                applied
                  ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500"
                  : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"
              }`}
            >
              <span className={`font-bold truncate ${applied ? "text-teal-700" : "text-slate-700"}`}>
                {c.matched_title}
              </span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded-full border text-[10px] font-black ${badge.cls}`}>
                {t(badge.key)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
