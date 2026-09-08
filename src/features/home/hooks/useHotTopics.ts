/**
 * 热门话题数据 hook — 热门国家 + 热门行业
 * Hot Topics Hook — Shared data for HeroSection and HotTopicsSection
 *
 * @module features/home/hooks/useHotTopics
 * @description HeroSection 和 HotTopicsSection 原先各自独立调用
 *              /api/notices/hot-topics，提取为统一 hook 后由 api-client
 *              飞行中去重，确保同一时刻只发 1 次请求。
 *              服务端 10 分钟缓存 + HTTP 10 分钟缓存，无需客户端轮询。
 */
import { useState, useEffect } from "react";
import { api } from "@/core/http";

export interface HotTopicsData {
  countries: Array<{ country: string; count: number }>;
  industries: Array<{ id: number; code: string; title_zh: string; title: string; count: number }>;
}

/**
 * 热门话题数据 hook — 获取热门国家 + 行业（含计数）。
 * 服务端已缓存，客户端仅首次加载时请求。
 */
export function useHotTopics(): { topics: HotTopicsData | null } {
  const [topics, setTopics] = useState<HotTopicsData | null>(null);

  useEffect(() => {
    api<HotTopicsData>("/api/notices/hot-topics")
      .then(setTopics)
      .catch(() => {});
  }, []);

  return { topics };
}
