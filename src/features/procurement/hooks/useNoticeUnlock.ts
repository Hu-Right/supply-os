/**
 * 公告解锁集合与详情加载 Hook
 * Notice Unlock Set & Detail Loading Hook
 *
 * @module features/procurement/hooks/useNoticeUnlock
 * @description 已解锁公告 id 集合与拓展详情拉取合并；
 *              登录后预取已解锁集合，供详情首帧决定是否按已解锁口径渲染。
 *              Unlocked id set and extended detail fetch/merge;
 *              prefetches unlocked ids after login.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem } from "../types";
import { fetchNoticeDetail, fetchNoticePreview, fetchUnlockedNoticeIds } from "../api";

export interface UseNoticeUnlockOptions {
  /** 当前登录用户 key */
  userId: number | undefined;
  /** 当前列表数据（openNoticeById 复用列表内已有项） */
  items: NoticeItem[];
  /** 选中详情设置器（Page 持有 selectedNotice，函数式更新合并拓展详情） */
  setSelectedNotice: Dispatch<SetStateAction<NoticeItem | null>>;
}

export interface UseNoticeUnlockReturn {
  /** 详情已落地（成功或失败）的公告 pk；null=当前选中的详情还没回来。
   *  用途：列表描述是 LEFT(300) 截断版，付费/已解锁用户要等全文落地后再渲染描述区，
   *  避免"截断 → 完整"的跳变；免费用户不看这个（其详情必 403，截断版就是终态）。 */
  detailSettledPk: number | null;
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
  userId,
  items,
  setSelectedNotice,
}: UseNoticeUnlockOptions): UseNoticeUnlockReturn {
  // 已解锁公告 id 集合
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set());
  // 详情落地标记（成功/失败都算落地）：只做"描述是否已是终态"的判据，不再驱动任何加载态 UI
  const [detailSettledPk, setDetailSettledPk] = useState<number | null>(null);

  // 详情/预览要按界面语言取机构译名（统一中文 2026-10-28）。
  // P2-2 口径：locale 同步到 ref 而不是进 useCallback 依赖，保持导出函数引用稳定；
  // 语言切换本就会重渲染整棵详情树，无需靠引用变化触发重拉。
  const { locale } = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;

  // P2-2：全部导出函数 useCallback 稳定化，作为下游 openNotice memo 依赖链的稳定源头
  const markUnlocked = useCallback((id: number) =>
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    }), []);

  // 登录后预取已解锁集合：详情首帧据此决定骨架屏还是锁定面板
  useEffect(() => {
    if (!userId) {
      setUnlockedIds(new Set());
      return;
    }
    let cancelled = false;
    fetchUnlockedNoticeIds().then((ids) => {
      if (!cancelled) setUnlockedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadNoticeDetail = useCallback(async (notice: NoticeItem) => {
    if (!userId) return;
    setDetailSettledPk(null);
    try {
      const detail = await fetchNoticeDetail(notice.noticePk, localeRef.current);
      setSelectedNotice((prev) => {
        if (!prev || prev.noticePk !== notice.noticePk) return prev;
        // 显式重置数组字段，防止前一个公告的数据残留
        return {
          ...prev,
          ...detail,
          attachments: detail.attachments ?? [],
          
          external_links: detail.externalLinks ?? [],
          contacts: detail.contacts ?? [],
          // detail 的 description 已是服务表全文（列表 SQL 才做 LEFT 300 截断），
          // 清掉列表项带下来的截断标记，避免全文后面仍挂一个「...」（骨架屏下线后首屏直接展示 teaser，更需要这条）
          descriptionTruncated: false,
        };
      });
      markUnlocked(notice.noticePk);
    } catch {
      // 未解锁或加载失败：保留列表数据，不阻断详情页
    } finally {
      // 成功或失败都算"落地"：失败时（如行业墙/锁定 403）回退展示列表截断版，避免描述区永久空白
      setDetailSettledPk(notice.noticePk);
    }
  }, [userId, setSelectedNotice, markUnlocked]);

  // 锁定态有限预览：机构名/分类标签（VIP 另含机构全称与发布日期），
  // 仅增强展示不含敏感字段，失败静默不阻断详情页
  const loadNoticePreview = useCallback(async (notice: NoticeItem) => {
    if (!userId) return;
    try {
      const preview = await fetchNoticePreview(notice.noticePk, localeRef.current);
      setSelectedNotice((prev) => {
        if (!prev || prev.noticePk !== notice.noticePk) return prev;
        // 预览接口不返回数组字段，显式清空防止残留
        return {
          ...prev,
          ...preview,
          attachments: [],
          
          external_links: [],
        };
      });
    } catch {
      // 预览为增强项：失败保留列表数据
    }
  }, [userId, setSelectedNotice]);

  // 按 id 打开公告详情（列表内已有则复用，否则以最小对象占位再合并拓展详情）
  const openNoticeById = useCallback(async (id: number) => {
    const base = items.find((it) => it.noticePk === id) || ({ noticePk: id } as NoticeItem);
    setSelectedNotice(base);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!unlockedIds.has(id)) void loadNoticePreview(base);
    await loadNoticeDetail(base);
  }, [items, unlockedIds, setSelectedNotice, loadNoticePreview, loadNoticeDetail]);

  const isUnlocked = useCallback((id: number) => unlockedIds.has(id), [unlockedIds]);

  return {
    detailSettledPk,
    isUnlocked,
    markUnlocked,
    loadNoticeDetail,
    loadNoticePreview,
    openNoticeById,
  };
}


