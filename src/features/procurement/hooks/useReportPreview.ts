/**
 * 报告预览数据拉取 Hook
 * Report Preview Data Fetching Hook
 *
 * @module features/procurement/hooks/useReportPreview
 * @description 解锁后拉取中文版订单拆解报告的结构化摘要（JSON），
 *              供 ReportPreviewPanel 组件渲染预览内容。
 *              请求失败时静默回退（error 状态由组件决定是否降级展示）。
 *              Fetches structured JSON summary of the Chinese bid breakdown
 *              report for preview rendering. Silently falls back on error.
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
}

export function useReportPreview(
  noticeId: number | undefined,
  userKey: string,
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
      `/api/notices/${noticeId}/report/preview?user_key=${encodeURIComponent(userKey)}`
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
  }, [noticeId, userKey]);

  return { preview, loading, error };
}
