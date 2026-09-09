/**
 * 采购列表页规模条数据 hook
 * Listing Stats Hook — Real-time procurement pool statistics
 *
 * @module features/procurement/hooks/useListingStats
 * @description 获取公告池实时统计（active/todayNew/deadline_in_30d/with_original_docs），
 *              服务端 10 分钟缓存，前端仅首次加载时请求一次。
 */
import { useState, useEffect } from "react";
import { api } from "@/core/http";

export interface ListingStats {
  active: number;
  todayNew: number;
  deadline_in_30d: number;
  with_original_docs: number;
}

export function useListingStats(): ListingStats | null {
  const [stats, setStats] = useState<ListingStats | null>(null);

  useEffect(() => {
    api<{
      active: number; todayNew?: number; deadline_in_30d?: number;
      with_original_docs?: number; bridged: number;
    }>("/api/notices/stats")
      .then((d) => setStats({
        active: d.active ?? 0,
        todayNew: d.todayNew ?? 0,
        deadline_in_30d: d.deadline_in_30d ?? 0,
        with_original_docs: d.with_original_docs ?? 0,
      }))
      .catch((err) => console.warn("[useListingStats] 统计接口加载失败:", err));
  }, []);

  return stats;
}
