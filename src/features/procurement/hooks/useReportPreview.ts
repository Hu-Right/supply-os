/**
 * 报告预览数据拉取 Hook
 * Report Preview Data Fetching Hook
 *
 * @module features/procurement/hooks/useReportPreview
 * @description 解锁后拉取中文版订单拆解报告的结构化摘要（JSON，按语言环境自适应：
 *              zh 优先 description_cn，非 zh 直接 description），供 ReportPreviewPanel
 *              组件渲染预览内容。请求失败时静默回退（error 状态由组件决定是否降级展示）。
 *              Fetches structured JSON summary (now only the Chinese procurement
 *              description section) for preview rendering. Silently falls back on error.
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";

/** 报告预览段落（与 Word 文档章节同构） */
export interface ReportPreviewSection {
  heading: string;
  body: string;
}

/** 报告预览数据结构（对应 GET /api/notices/:id/report/preview 响应） */
export interface ReportPreviewData {
  sections: ReportPreviewSection[];
  /** 当前用户是否已解锁该公告 */
  is_unlocked: boolean;
  has_full_report: boolean;
  /** 完整 Word 报告总字符数（用于预览百分比计算） */
  total_report_chars: number;
}

export function useReportPreview(
  noticeId: number | undefined,
  userKey: string,
  /** 当前语言环境，zh 优先 description_cn，非 zh 直接 description */
  lang: string = "zh",
  /** 解锁状态变化触发重新请求（core_locked 从 true → false 时触发） */
  coreLocked?: boolean,
) {
  const [preview, setPreview] = useState<ReportPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!noticeId || !userKey) {
      setPreview(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    api<ReportPreviewData>(
      `/api/notices/${noticeId}/report/preview?user_key=${encodeURIComponent(userKey)}&lang=${encodeURIComponent(lang)}`
    )
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [noticeId, userKey, lang, coreLocked]);

  return { preview, loading, error };
}
