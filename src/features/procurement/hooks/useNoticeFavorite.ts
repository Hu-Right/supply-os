/**
 * 公告收藏状态 Hook
 * Notice Favorite State Hook
 *
 * @module features/procurement/hooks/useNoticeFavorite
 * @description 维护当前用户已收藏公告的 id 集合：登录后拉取一次全量 id，
 *              收藏/取消走乐观更新（失败回滚，成功后以服务端返回为准回写）。
 *              未登录触发 require-login 事件弹出登录。
 */
import { useCallback, useEffect, useState } from "react";
import { fetchNoticeFavoriteIds, toggleNoticeFavorite } from "../api";

export interface UseNoticeFavoriteOptions {
  /** 当前登录用户 id，未登录为 undefined */
  userId: number | undefined;
  /** 未登录时触发登录弹窗 */
  onRequireLogin: () => void;
}

export interface UseNoticeFavoriteReturn {
  /** 已收藏公告 id 集合（列表卡片批量回显） */
  favoriteIds: Set<number>;
  /** 单条查询 */
  isFavorite: (noticeId: number) => boolean;
  /** 收藏/取消收藏，返回切换后的状态；未登录时不发请求 */
  toggleFavorite: (noticeId: number) => Promise<boolean | undefined>;
}

export function useNoticeFavorite({ userId, onRequireLogin }: UseNoticeFavoriteOptions): UseNoticeFavoriteReturn {
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set());

  // 登录后拉取全量已收藏 id；登出清空
  useEffect(() => {
    if (!userId) {
      setFavoriteIds(new Set());
      return;
    }
    let cancelled = false;
    fetchNoticeFavoriteIds()
      .then((res) => {
        if (!cancelled) setFavoriteIds(new Set(res.ids || []));
      })
      .catch(() => {
        // 状态回显失败不阻塞页面，按钮退回未收藏态
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isFavorite = useCallback((noticeId: number) => favoriteIds.has(noticeId), [favoriteIds]);

  const toggleFavorite = useCallback(
    async (noticeId: number): Promise<boolean | undefined> => {
      if (!userId) {
        onRequireLogin();
        return undefined;
      }
      // 乐观更新
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(noticeId)) next.delete(noticeId);
        else next.add(noticeId);
        return next;
      });
      try {
        const res = await toggleNoticeFavorite(noticeId);
        // 以服务端结果为准回写
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (res.favorited) next.add(noticeId);
          else next.delete(noticeId);
          return next;
        });
        return res.favorited;
      } catch (err) {
        // 失败回滚乐观状态
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (next.has(noticeId)) next.delete(noticeId);
          else next.add(noticeId);
          return next;
        });
        throw err;
      }
    },
    [userId, onRequireLogin],
  );

  return { favoriteIds, isFavorite, toggleFavorite };
}
