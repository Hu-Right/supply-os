/**
 * 满意度评价卡片（P1）
 *
 * @module features/crm/components/DigitalAssistant/RatingCard
 * @description 人工会话结束后在聊天窗口内邀请评分：1-5 星 + 标签 + 可选文字。
 *              提交走 POST /api/crm/chat/sessions/rate（仅 closed 且未评价可提交）。
 */
import { useState } from "react";
import { Star } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Textarea } from "@/shared/ui";

type RatingCardProps = {
  onSubmit: (score: number, tag?: string, comment?: string) => Promise<void>;
  onSkip: () => void;
};

const TAG_KEYS = ["crmRateTagFast", "crmRateTagAttitude", "crmRateTagUnresolved"] as const;

export function RatingCard({ onSubmit, onSkip }: RatingCardProps) {
  const { t } = useLocale();
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (score < 1 || sending) return;
    setSending(true);
    try {
      await onSubmit(score, tag, comment.trim() || undefined);
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  if (done) return null;

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-700 mb-2">{t("crmAssistantRateInvite")}</p>

      {/* 星级 */}
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="p-0.5"
            aria-label={`${n}`}
          >
            <Star
              className={`w-5 h-5 transition-colors ${
                n <= (hovered || score)
                  ? "fill-amber-400 text-amber-400"
                  : "text-slate-300"
              }`}
            />
          </button>
        ))}
      </div>

      {/* 标签（单选） */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {TAG_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTag(tag === t(key) ? undefined : t(key))}
            className={`px-2.5 py-1 rounded-full text-3xs border transition-colors ${
              tag === t(key)
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-teal-400"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {/* 文字反馈 */}
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("crmAssistantRateCommentPlaceholder")}
        rows={2}
        maxLength={500}
        className="w-full resize-none border border-slate-200 rounded-lg px-3 py-2 text-xs
          text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500
          focus:border-teal-500 focus:outline-none mb-2"
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={score < 1 || sending}
          onClick={handleSubmit}
          className="text-3xs px-3 py-1.5 rounded-full"
        >
          {sending ? "…" : t("crmAssistantRateSubmit")}
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-3xs text-slate-400 hover:text-slate-600"
        >
          {t("crmAssistantRateSkip")}
        </button>
      </div>
    </div>
  );
}

RatingCard.displayName = "RatingCard";
