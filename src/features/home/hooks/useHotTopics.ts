/**
 * 热门话题数据 hook — 热门国家 + 热门品目大类
 * Hot Topics Hook — Shared data for HeroSection and HotTopicsSection
 *
 * @module features/home/hooks/useHotTopics
 * @description HeroSection 和 HotTopicsSection 原先各自独立调用
 *              /api/notices/hot-topics，提取为统一 hook 后由 api-client
 *              飞行中去重，确保同一时刻只发 1 次请求。
 *              服务端 10 分钟缓存 + HTTP 10 分钟缓存，无需客户端轮询。
 *
 * 返回值：
 * - topics: 数据（null = 加载中或失败）
 * - loading: 是否正在加载
 * - error: 是否加载失败
 *
 * 2026-10-11：服务端给的是大类码而不是名字（全库名字口径只有一份：commodityGroup_*
 * locale 键，与五级下拉第一级、chip 同一份）。名字不在服务端拼 DB 字段：实测
 * 骨架 L2~L4 的 name_en 全空，非中文界面会渲染出空标签。
 */
import { useState, useEffect } from "react";
import { api } from "@/core/http";
import { isCommodityGroupCode } from "@/lib/services/commodity/groups";

/** 热门大类（服务端 hot-topics 聚合的 industries 字段）：node 只供诊断，code 才是身份 */
export interface HotGroupItem {
  node: string;
  code: string;
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
 * 1. 不认识的码直接丢掉（与五级下拉「空层不给假选项」同一口径）：t() 缺键时返回
 *    键名本身，界面上会冒出一串 `commodityGroup_UGT-G-99` 给用户看；
 * 2. 链接走 `?group=<大类码>`：它就是检索侧的大类谓词入口（与五级下拉第一级同一个参数），
 *    旧的 `?industry_id=<旧字典行 id>` 是十个字母容器，点进去筛不出标签说的那一类。
 */
export function hotGroupView(
  items: HotGroupItem[],
  t: (key: string) => string,
): HotGroupView[] {
  return items
    .filter((i) => isCommodityGroupCode(i.code))
    .map((i) => ({
      key: i.code,
      label: t(`commodityGroup_${i.code}`),
      count: i.count,
      href: `/procurement?group=${i.code}`,
    }));
}

/**
 * 热门话题数据 hook — 获取热门国家 + 热门大类（含计数）。
 * 服务端已缓存，客户端仅首次加载时请求。
 */
export function useHotTopics(): UseHotTopicsReturn {
  const [topics, setTopics] = useState<HotTopicsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<HotTopicsData>("/api/notices/hot-topics")
      .then(setTopics)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { topics, loading, error };
}
