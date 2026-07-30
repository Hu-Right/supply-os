/**
 * Notice on-demand translation hook
 *
 * @module features/procurement/hooks/useNoticeTranslation
 * @description 按需拉取公告标题/说明的 AI 译文：
 *              基于原文内容检测（needsContentTranslation）而非"原文必为英文"假设——
 *              中文原文在英文环境会请求英译；中文原文在中文环境跳过无效翻译。
 *              首次由后端调翻译链并缓存，之后走数据库缓存；
 *              失败时静默回退原文，并提供"查看原文"切换。
 *              Fetches AI translation of a notice based on content-script detection
 *              (not the legacy "source is always English" assumption) with
 *              server-side caching; falls back to the original silently.
 */
import { useEffect, useState } from "react";
import { needsContentTranslation } from "@/core/i18n";
import { fetchNoticeTranslation } from "../api";
import type { NoticeTranslation } from "../types";

type TranslationResult = { noticeId: number; lang: string; data: NoticeTranslation };

export function useNoticeTranslation(
  noticeId: number | undefined,
  locale: string,
  /** 公告原文（标题+描述），用于内容语言检测；缺省空串时按无法判断处理（不请求） */
  sourceText = ""
) {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // 渲染期键匹配：公告或语言切换的当帧旧译文立即失效，
  // 杜绝"B 公告闪现 A 公告译文"的单帧串台（effect 晚于渲染执行）
  const translation =
    result && result.noticeId === noticeId && result.lang === locale ? result.data : null;

  useEffect(() => {
    setShowOriginal(false);
    // 内容语言检测代替原 `locale === "en"` 短路：原文已是目标语言时不请求，
    // 非英文原文（如中文）在英文环境下同样发起翻译（服务端 lang=en 已支持）
    if (!noticeId || !needsContentTranslation(sourceText, locale)) return;

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
  }, [noticeId, locale, sourceText]);

  return {
    translation,
    translating,
    showOriginal,
    toggleOriginal: () => setShowOriginal((v) => !v),
  };
}
