/**
 * 采购列表页规模条数据 hook
 * Listing Stats Hook — Real-time procurement pool statistics
 *
 * @module features/procurement/hooks/useListingStats
 * @description 获取公告池实时统计（active/todayNew/deadlineIn30d/withOriginalDocs），
 *              服务端 10 分钟缓存，前端仅首次加载时请求一次。
 */
import { useState, useEffect } from "react";
import { api } from "@/core/http";

export interface ListingStats {
  active: number;
  todayNew: number;
  yesterdayNew: number;
  deadlineIn30d: number;
  withOriginalDocs: number;
}

const EMPTY_STATS: ListingStats = {
  active: 0,
  todayNew: 0,
  yesterdayNew: 0,
  deadlineIn30d: 0,
  withOriginalDocs: 0,
};

export function useListingStats(): ListingStats {
  const [stats, setStats] = useState<ListingStats>(EMPTY_STATS);

  useEffect(() => {
    api<{
      active: number; todayNew?: number; yesterdayNew?: number; deadlineIn30d?: number;
      withOriginalDocs?: number; bridged: number;
    }>("/api/notices/stats")
      .then((d) => setStats({
        active: d.active ?? 0,
        todayNew: d.todayNew ?? 0,
        yesterdayNew: d.yesterdayNew ?? 0,
        deadlineIn30d: d.deadlineIn30d ?? 0,
        withOriginalDocs: d.withOriginalDocs ?? 0,
      }))
      .catch((err) => console.warn("[useListingStats] 统计接口加载失败:", err));
  }, []);

  return stats;
}
