/**
 * 公告解锁集合与详情加载 Hook
 * Notice Unlock Set & Detail Loading Hook
 *
 * @module features/procurement/hooks/useNoticeUnlock
 * @description 已解锁公告 id 集合、详情拓展加载态与拓展详情拉取合并；
 *              登录后预取已解锁集合，供详情首帧决定骨架屏还是锁定面板。
 *              Unlocked id set, detail loading state and extended detail
 *              fetch/merge; prefetches unlocked ids after login.
 */
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { NoticeItem } from "../types";
import { fetchNoticeDetail, fetchNoticePreview, fetchUnlockedNoticeIds } from "../api";

export interface UseNoticeUnlockOptions {
  /** 当前登录用户 key */
  userKey: string | undefined;
  /** 当前列表数据（openNoticeById 复用列表内已有项） */
  items: NoticeItem[];
  /** 选中详情设置器（Page 持有 selectedNotice，函数式更新合并拓展详情） */
  setSelectedNotice: Dispatch<SetStateAction<NoticeItem | null>>;
}

export interface UseNoticeUnlockReturn {
  /** 详情拓展加载中的公告 id；快速连续点击时 A 的 finally 不会误清 B 的加载态 */
  detailLoadingId: number | null;
  setDetailLoadingId: Dispatch<SetStateAction<number | null>>;
  isUnlocked: (id: number) => boolean;
  markUnlocked: (id: number) => void;
  /** 拉取已解锁公告的拓展详情并合并进当前选中项 */
  loadNoticeDetail: (notice: NoticeItem) => Promise<void>;
  /** 拉取锁定态有限预览（机构名/分类标签；VIP 另含机构全称与发布日期）并合并进当前选中项 */
  loadNoticePreview: (notice: NoticeItem) => Promise<void>;
  /** 按 id 打开公告详情（列表内已有则复用，否则以最小对象占位再合并拓展详情） */
  openNoticeById: (id: number) => Promise<void>;
}

export function useNoticeUnlock({
  userKey,
  items,
  setSelectedNotice,
}: UseNoticeUnlockOptions): UseNoticeUnlockReturn {
  // 已解锁公告 id 集合 + 详情拓展加载态（闪烁修复）
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set());
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const markUnlocked = (id: number) =>
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  // 登录后预取已解锁集合：详情首帧据此决定骨架屏还是锁定面板
  useEffect(() => {
    if (!userKey) {
      setUnlockedIds(new Set());
      return;
    }
    let cancelled = false;
    fetchUnlockedNoticeIds(userKey).then((ids) => {
      if (!cancelled) setUnlockedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  const loadNoticeDetail = async (notice: NoticeItem) => {
    if (!userKey) {
      setDetailLoadingId(null);
      return;
    }
    try {
      const detail = await fetchNoticeDetail(notice.id, userKey);
      setSelectedNotice((prev) => (prev && prev.id === notice.id ? { ...prev, ...detail } : prev));
      markUnlocked(notice.id);
    } catch {
      // 未解锁或加载失败：保留列表数据，不阻断详情页
    } finally {
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
    }
  };

  // 锁定态有限预览：机构名/分类标签（VIP 另含机构全称与发布日期），
  // 仅增强展示不含敏感字段，失败静默不阻断详情页
  const loadNoticePreview = async (notice: NoticeItem) => {
    if (!userKey) return;
    try {
      const preview = await fetchNoticePreview(notice.id, userKey);
      setSelectedNotice((prev) => (prev && prev.id === notice.id ? { ...prev, ...preview } : prev));
    } catch {
      // 预览为增强项：失败保留列表数据
    }
  };

  // 按 id 打开公告详情（列表内已有则复用，否则以最小对象占位再合并拓展详情）
  const openNoticeById = async (id: number) => {
    const base = items.find((it) => it.id === id) || ({ id } as NoticeItem);
    setDetailLoadingId(id);
    setSelectedNotice(base);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!unlockedIds.has(id)) void loadNoticePreview(base);
    await loadNoticeDetail(base);
  };

  return {
    detailLoadingId,
    setDetailLoadingId,
    isUnlocked: (id: number) => unlockedIds.has(id),
    markUnlocked,
    loadNoticeDetail,
    loadNoticePreview,
    openNoticeById,
  };
}
