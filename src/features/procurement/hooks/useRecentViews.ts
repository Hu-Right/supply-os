/**
 * 最近查看记录取数 Hook
 * Recent views data hook
 *
 * @module features/procurement/hooks/useRecentViews
 * @description 组件仅负责展示，取数下沉本 hook（约定：数据获取统一在 hooks 层）。
 *              拉取当前用户最近 N 条公告解锁记录；失败静默返回空数组，不阻断采购列表。
 *              原为组件内联的 useEffect + apiCached 逻辑，行为一致。
 */
import { useEffect, useState } from "react";
import { apiCached, buildQuery } from "@/core/http";
import { pickNoticeApiLang } from "@/shared/constants/langs";

/** 最近查看记录。传输层仍沿用历史命名（/api/payment/access-records 的 AccessRecord 契约），展示层统一叫「查看」。 */
export interface RecentViewRecord {
  noticeId: number;
  grantType: string;
  price: number;
  grantedAt?: string | null;
  notice?: {
    title?: string | null;
    titleI18n?: string | null;
    titleCn?: string | null;
    deadlineExpired?: boolean | null;
  } | null;
}

/** 查询用户最近查看记录（传输端点保留历史命名 /api/payment/access-records） */
async function fetchViewHistory(params: {
  page?: number;
  limit?: number;
  locale?: string;
}): Promise<{ total: number; list: RecentViewRecord[] }> {
  const qs = buildQuery({
    page: params.page,
    limit: params.limit,
    lang: pickNoticeApiLang(params.locale),
  });
  return apiCached<{ total: number; list: RecentViewRecord[] }>(`/api/payment/access-records?${qs}`, 5 * 60 * 1000);
}

/** 拉取最近查看记录；userId/locale 变化时刷新 */
export function useRecentViews(userId: number, locale: string, limit = 3): { records: RecentViewRecord[] } {
  const [records, setRecords] = useState<RecentViewRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchViewHistory({ limit, locale })
      .then((res) => {
        if (!cancelled) setRecords(res.list || []);
      })
      .catch((e) => {
        console.warn("[useRecentViews] 最近查看记录加载失败:", e);
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, locale, limit]);

  return { records };
}
