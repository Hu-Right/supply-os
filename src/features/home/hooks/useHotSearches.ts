/**
 * 首页「热门搜索」取数 hook（真实检索行为聚合）
 *
 * @module features/home/hooks/useHotSearches
 * @description 消费 GET /api/notices/hot-searches：
 *              - `mode: "hot"` → 展示真实检索热词；
 *              - `mode: "fallback"`（数据量不足/接口失败）→ 由 HeroSection 回退到现有
 *                「数据覆盖榜」标签，不展示单人测试词。
 *              SSR 注入 initial 时首帧即有值，挂载后仍后台刷新一次（10 分钟 HTTP 缓存兜住频率）。
 */
import { useEffect, useState } from "react";
import { apiCached } from "@/core/http";

export type HotSearchMode = "hot" | "fallback";

/** 单个热词标签：term 是归一化检索词（用于链接），label 是展示原文 */
export interface HotSearchKeyword {
  term: string;
  label: string;
  href: string;
}

export interface HotSearchesData {
  mode: HotSearchMode;
  keywords: HotSearchKeyword[];
}

export function useHotSearches(initial?: HotSearchesData | null): {
  data: HotSearchesData | null;
  loading: boolean;
} {
  const [data, setData] = useState<HotSearchesData | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    let cancelled = false;
    apiCached<HotSearchesData>("/api/notices/hot-searches")
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // 静默失败：保持初值/数据覆盖榜回退，不影响 Hero 其他内容
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
