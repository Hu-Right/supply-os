/**
 * 我的收藏公告取数 Hook
 * Favorite notices data hook
 *
 * @module features/procurement/hooks/useFavoriteNotices
 * @description 组件仅负责展示，取数下沉本 hook（约定：数据获取统一在 hooks 层）。
 *              按收藏集合变化拉取最近 N 条收藏公告；无收藏/失败静默返回空数组。
 *              原为 FavoriteNotices 组件内联的 useEffect + api 逻辑，行为一致。
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";
import type { NoticeFavoriteEntry } from "../api";

/** 与 RecentUnlocks 的翻译语言白名单口径一致 */
const NOTICE_API_LANGS = new Set(["zh", "en", "fr", "ru", "es", "ar"]);

/** 拉取收藏公告；favoriteIds 内容或 locale 变化时刷新 */
export function useFavoriteNotices(
  favoriteIds: Set<number>,
  locale: string,
  limit = 5,
): { items: NoticeFavoriteEntry[] } {
  const [items, setItems] = useState<NoticeFavoriteEntry[]>([]);
  // 集合内容序列化作为刷新信号（引用变化但内容相同的渲染不重复请求）
  const idsKey = Array.from(favoriteIds).sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (favoriteIds.size === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const lang = locale && NOTICE_API_LANGS.has(locale) ? `&lang=${locale}` : "";
    api<{ list: NoticeFavoriteEntry[] }>(`/api/notices/favorites?limit=${limit}${lang}`)
      .then((res) => {
        if (!cancelled) setItems(res.list || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, locale, limit]);

  return { items };
}
