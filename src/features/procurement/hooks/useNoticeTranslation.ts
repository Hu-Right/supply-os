/**
 * Notice on-demand translation hook
 *
 * @module features/procurement/hooks/useNoticeTranslation
 * @description 非英文环境下按需拉取公告标题/说明的 AI 译文：
 *              首次由后端调 Gemini 翻译并缓存，之后走数据库缓存；
 *              失败时静默回退英文原文，并提供"查看原文"切换。
 *              Fetches AI translation of a notice for non-en locales with
 *              server-side caching; falls back to the original silently.
 */
import { useEffect, useState } from "react";
import { fetchNoticeTranslation } from "../api";
import type { NoticeTranslation } from "../types";

type TranslationResult = { noticeId: number; lang: string; data: NoticeTranslation };

export function useNoticeTranslation(noticeId: number | undefined, locale: string) {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // 渲染期键匹配：公告或语言切换的当帧旧译文立即失效，
  // 杜绝"B 公告闪现 A 公告译文"的单帧串台（effect 晚于渲染执行）
  const translation =
    result && result.noticeId === noticeId && result.lang === locale ? result.data : null;

  useEffect(() => {
    setShowOriginal(false);
    if (!noticeId || locale === "en") return;

    let cancelled = false;
    setTranslating(true);
    fetchNoticeTranslation(noticeId, locale)
      .then((data) => {
        if (!cancelled) setResult({ noticeId, lang: locale, data });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noticeId, locale]);

  return {
    translation,
    translating,
    showOriginal,
    toggleOriginal: () => setShowOriginal((v) => !v),
  };
}
