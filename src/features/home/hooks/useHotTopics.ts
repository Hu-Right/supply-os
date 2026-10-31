/**
 * 热门话题数据 hook — 热门国家 + 热门品目大类
 * Hot Topics Hook — Shared data for HeroSection and HotTopicsSection
 *
 * @module features/home/hooks/useHotTopics
 * @description HeroSection 和 HotTopicsSection 原先各自独立调用
 *              /api/notices/hot-topics，提取为统一 hook 后由 apiCached 的
 *              TTL 缓存 + 飞行中去重，确保同一时刻只发 1 次真实请求。
 *              服务端 10 分钟缓存 + HTTP 10 分钟缓存，无需客户端轮询。
 *
 * 返回值：
 * - topics: 数据（null = 加载中或失败）
 * - loading: 是否正在加载
 * - error: 是否加载失败
 *
 * 2026-10-15 G 码退役：服务端直出 L1 树码 + 树名（name_zh），名字以树为唯一事实源，
 * 不再有 commodityGroup_* locale 键第二口径。
 */
import { useState, useEffect } from "react";
import { apiCached } from "@/core/http";
import { isCommodityNodeKey } from "@/shared/constants/commodity-code";

/** 热门大类（服务端 hot-topics 聚合的 industries 字段）：code = L1 树码 + 筛选链接身份 */
export interface HotGroupItem {
  code: string;
  nameZh: string;
  count: number;
}

export interface HotTopicsData {
  countries: Array<{ country: string; count: number }>;
  industries: HotGroupItem[];
}

export interface UseHotTopicsReturn {
  topics: HotTopicsData | null;
  loading: boolean;
  error: boolean;
}

/** 一个热门大类的展示单元 */
export interface HotGroupView {
  key: string;
  label: string;
  count: number;
  href: string;
}

/**
 * 大类 → 标签 / 链接（两个组件共用这一份，不各自拼两份）。两条纪律：
 * 1. 不认识的码直接丢掉（与五级下拉「空层不给假选项」同一口径）：名字缺失时落到码本身，
 *    界面上冒出裸码比冒假类目诚实；
 * 2. 链接走 `?commodity=<L1 码>`：它就是检索侧的品目谓词入口（传 L1 码即大类筛选），
 *    旧的 `?group=` 与更旧的 `?industry_id=<旧字典行 id>` 都已退役。
 */
export function hotGroupView(
  items: HotGroupItem[],
): HotGroupView[] {
  return items
    .filter((i) => isCommodityNodeKey(i.code))
    .map((i) => ({
      key: i.code,
      label: i.nameZh || i.code,
      count: i.count,
      href: `/procurement?commodity=${i.code}`,
    }));
}

/**
 * 热门话题数据 hook — 获取热门国家 + 热门大类（含计数）。
 * 服务端已缓存，客户端走 apiCached（TTL 缓存 + 飞行中去重），仅首次加载时发真实请求。
 * 2026-10-31 RSC 直出：传入 initial（home-snapshot 服务端快照）时跳过拉取，
 * 首屏直出真实内容——未传时行为与旧版完全一致。
 */
export function useHotTopics(options?: { initial?: HotTopicsData | null }): UseHotTopicsReturn {
  const initial = options?.initial ?? null;
  const [topics, setTopics] = useState<HotTopicsData | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initial) return; // RSC 快照已就绪：跳过客户端拉取（快照新鲜度由服务端 10 分钟缓存 + ISR 兜底）
    apiCached<HotTopicsData>("/api/notices/hot-topics")
      .then(setTopics)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [initial]);

  return { topics, loading, error };
}
