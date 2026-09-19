/**
 * 最近解锁记录取数 Hook
 * Recent unlocks data hook
 *
 * @module features/procurement/hooks/useRecentUnlocks
 * @description 组件仅负责展示，取数下沉本 hook（约定：数据获取统一在 hooks 层）。
 *              拉取当前用户最近 N 条公告解锁记录；失败静默返回空数组，不阻断采购列表。
 *              原为 RecentUnlocks 组件内联的 useEffect + apiCached 逻辑，行为一致。
 */
import { useEffect, useState } from "react";
import { apiCached, buildQuery } from "@/core/http";

/** 解锁记录（与 payment/api UnlockRecord 对齐） */
export interface UnlockRecord {
  user_id: number;
  notice_id: number;
  unlock_type: string;
  price: number;
  unlocked_at?: string | null;
  notice?: {
    title?: string | null;
    title_i18n?: string | null;
    deadline_expired?: boolean | null;
  } | null;
}

/** 本地差异 #18：与 features/payment/api 对齐 */
const NOTICE_API_LANGS = new Set(["zh", "en", "fr", "ru", "es", "ar"]);

/** 查询用户解锁记录 */
async function fetchUnlocks(params: {
  page?: number;
  limit?: number;
  locale?: string;
}): Promise<{ total: number; list: UnlockRecord[] }> {
  const qs = buildQuery({
    page: params.page,
    limit: params.limit,
    lang: params.locale && NOTICE_API_LANGS.has(params.locale) ? params.locale : undefined,
  });
  return apiCached<{ total: number; list: UnlockRecord[] }>(`/api/payment/unlocks?${qs}`, 5 * 60 * 1000);
}

/** 拉取最近解锁记录；userId/locale 变化时刷新 */
export function useRecentUnlocks(userId: number, locale: string, limit = 3): { records: UnlockRecord[] } {
  const [records, setRecords] = useState<UnlockRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchUnlocks({ limit, locale })
      .then((res) => {
        if (!cancelled) setRecords(res.list || []);
      })
      .catch((e) => {
        console.warn("[useRecentUnlocks] 解锁记录加载失败:", e);
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, locale, limit]);

  return { records };
}
