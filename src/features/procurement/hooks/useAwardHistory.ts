/**
 * 同类品类历史中标数据 Hook
 * Award History Data Hook
 *
 * @module features/procurement/hooks/useAwardHistory
 * @description 根据公告 ID 从 /api/notices/:id/award-history 获取同类 UNSPSC 品类的
 *              历史中标数据（采购次数、国家分布、中标商排行、最近记录）。
 *              手动触发模式：用户切换到「历史中标」Tab 时才发起请求。
 */
import { useCallback, useState } from "react";
import { api } from "@/core/http";
import { gateErrorToken } from "../api/notice-gate";

// ── 类型定义 ──

export interface AwardCountryStat {
  country: string;
  count: number;
  total_usd: number;
}

export interface AwardWinnerStat {
  name: string;
  name_cn: string | null;
  country: string | null;
  count: number;
  total_usd: number;
}

export interface AwardRecentItem {
  id: number;
  title: string;
  title_cn: string | null;
  agency: string | null;
  country: string | null;
  award_date: string | null;
  contract_value_usd: number | null;
  currency: string;
  category: string | null;
  winners: Array<{ name: string; name_cn: string | null; country: string | null }>;
}

export interface AwardHistoryData {
  total: number;
  total_value_usd: number;
  by_country: AwardCountryStat[];
  top_winners: AwardWinnerStat[];
  recent_awards: AwardRecentItem[];
  unspsc_matched: string[];
}

export interface UseAwardHistoryReturn {
  data: AwardHistoryData | null;
  loading: boolean;
  error: string | null;
  triggerFetch: () => void;
}

/**
 * 同类品类历史中标 Hook（手动触发）
 *
 * 用户切换到「历史中标」Tab 时调用 triggerFetch()，
 * 避免每次打开详情页都请求中标数据。
 */
export function useAwardHistory(noticeId: number | undefined): UseAwardHistoryReturn {
  const [data, setData] = useState<AwardHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerFetch = useCallback(() => {
    if (!noticeId || loading) return;
    setLoading(true);
    setError(null);
    api<{ code: number; data: AwardHistoryData }>(
      `/api/notices/${noticeId}/award-history`,
    )
      .then((resp) => {
        setData(resp.data);
      })
      .catch((err) => {
        setError(gateErrorToken(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [noticeId, loading]);

  return { data, loading, error, triggerFetch };
}
