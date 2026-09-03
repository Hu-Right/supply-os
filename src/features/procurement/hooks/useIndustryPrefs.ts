/**
 * 行业偏好 Hook
 * Industry Preferences Hook
 *
 * @module features/procurement/hooks/useIndustryPrefs
 * @description 账号默认行业偏好三级降级（偏好 → 推荐 → 全量）、UNSPSC 五级级联
 *              选择状态与 supply-os:industry-prefs-updated 事件订阅。
 *              ARCH-P3b（2026-08-31）：UNSPSC 级联逻辑拆分至 useUnspscCascade.ts。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { onAppEvent } from "@/core/events";
import { clearApiCache } from "@/core/http";
import type { UnspscOption, NoticeItem, PrefsMode } from "../types";
import { fetchIndustryPrefs } from "@/core/api/industry-prefs";
import { fetchUnifiedSearch } from "../api";
import { NOTICE_PAGE_SIZE } from "../constants";
import { useUnspscCascade } from "./useUnspscCascade";

export interface UseIndustryPrefsOptions {
  /** 当前登录用户 key，未登录直接回 default 全量 */
  userKey: number | undefined;
  /** 当前语言（UNSPSC 选项译文按 lang 由后端返回） */
  locale: string;
  /** 页码设置器（自动筛选/手动改选时重置为 1） */
  setPage: (page: number) => void;
  /** 清空当前选中详情（手动改选时重置详情态） */
  setSelectedNotice: (notice: NoticeItem | null) => void;
}

export interface UseIndustryPrefsReturn {
  levels: UnspscOption[][];
  setLevels: Dispatch<SetStateAction<UnspscOption[][]>>;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  prefsMode: PrefsMode;
  setPrefsMode: Dispatch<SetStateAction<PrefsMode>>;
  prefsBannerName: string;
  deepestCodeId: string;
  /** 账号是否已设置默认行业偏好（决定"恢复行业匹配"按钮显示） */
  hasIndustryPrefs: boolean;
  exitAutoMode: () => void;
  handleLevelChange: (levelIndex: number, value: string) => Promise<void>;
  /** 清除手动搜索条件并切回行业精准匹配模式（无偏好时回退 default） */
  restorePrefsMode: () => Promise<void>;
}

export function useIndustryPrefs(options: UseIndustryPrefsOptions): UseIndustryPrefsReturn {
  const { userKey, locale, setPage, setSelectedNotice } = options;

  // UNSPSC 级联选择（拆分至独立 hook）
  const cascade = useUnspscCascade({ locale });
  const { levels, setLevels, selectedIds, setSelectedIds, handleLevelChange: cascadeHandleLevelChange } = cascade;

  // 行业精准匹配模式下的偏好路径（仅用于提示条展示行业名称）
  const [prefsPath, setPrefsPath] = useState<string[]>(["", "", "", "", ""]);

  // ── 账号默认行业偏好三级降级 ──
  const [prefsMode, setPrefsMode] = useState<PrefsMode>(() => (userKey ? "loading" : "default"));
  const [hasIndustryPrefs, setHasIndustryPrefs] = useState(false);
  const prefsInitKeyRef = useRef<number | null>(null);
  const [prefsRefreshTick, setPrefsRefreshTick] = useState(0);
  const exitSeqRef = useRef(0);

  /**
   * 按偏好路径预选级联并切 prefs 模式
   */
  const applyPrefsPath = async (prefs: { level1_id?: number | null; level2_id?: number | null; level3_id?: number | null }) => {
    const path = [prefs.level1_id, prefs.level2_id, prefs.level3_id, null, null]
      .map((id) => (id ? String(id) : ""));
    const entrySeq = exitSeqRef.current;
    const { fetchUnspscChildren } = await import("@/core/unspsc/api");
    const childRequests: Promise<UnspscOption[]>[] = [];
    for (let i = 0; i < 4 && path[i]; i += 1) {
      childRequests.push(fetchUnspscChildren(path[i], locale).catch(() => []));
    }
    const childResults = await Promise.all(childRequests);
    if (exitSeqRef.current !== entrySeq) return;
    const nextChildren: UnspscOption[][] = [[], [], [], []];
    for (let i = 0; i < childResults.length; i += 1) {
      nextChildren[i] = Array.isArray(childResults[i]) ? childResults[i] : [];
    }
    setLevels((prev) => [prev[0], nextChildren[0], nextChildren[1], nextChildren[2], nextChildren[3]]);
    setPrefsPath(path);
    setSelectedIds(["", "", "", "", ""]);
    setPrefsMode("prefs");
  };

  /**
   * 恢复行业匹配
   */
  const restorePrefsMode = async () => {
    if (!userKey) return;
    setPage(1);
    setPrefsMode("prefs");
    try {
      const prefs = await fetchIndustryPrefs();
      if (prefs?.level1_id) {
        setHasIndustryPrefs(true);
        await applyPrefsPath(prefs);
      } else {
        setHasIndustryPrefs(false);
        setPrefsMode("default");
      }
    } catch {
      setPrefsMode("default");
    }
  };

  // 包装 cascade 的 handleLevelChange，添加 prefsMode 管理
  const handleLevelChange = async (levelIndex: number, value: string) => {
    if (prefsMode !== "default") setPrefsMode("default");
    exitSeqRef.current += 1;
    setPage(1);
    setSelectedNotice(null);
    await cascadeHandleLevelChange(levelIndex, value);
  };

  useEffect(() => {
    if (!userKey) {
      prefsInitKeyRef.current = null;
      setHasIndustryPrefs(false);
      if (prefsMode !== "default") {
        setPrefsMode("default");
        setSelectedIds(["", "", "", "", ""]);
        setPrefsPath(["", "", "", "", ""]);
        setLevels((prev) => [prev[0], [], [], [], []]);
        setPage(1);
      }
      return;
    }
    if (prefsInitKeyRef.current === userKey) return;
    prefsInitKeyRef.current = userKey;
    if (prefsMode !== "loading") setPrefsMode("loading");
    const stale = () => prefsInitKeyRef.current !== userKey;
    const detect = async () => {
      try {
        const prefs = await fetchIndustryPrefs();
        if (stale()) return;
        if (prefs?.level1_id) {
          setHasIndustryPrefs(true);
          await applyPrefsPath(prefs);
          return;
        }
        setHasIndustryPrefs(false);
        try {
          const probe = await fetchUnifiedSearch({ mode: "recommended", page: 1, pageSize: NOTICE_PAGE_SIZE });
          if (stale()) return;
          if (Number(probe.total || 0) > 0) {
            setPrefsMode("recommended");
            return;
          }
        } catch {
          // 推荐接口异常同样回退全量
        }
        if (!stale()) setPrefsMode("default");
      } catch {
        if (!stale()) setPrefsMode("default");
      }
    };
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    Promise.race([detect(), timeout]).then(() => {
      if (!stale() && prefsInitKeyRef.current === userKey) {
        setPrefsMode((prev) => prev === "loading" ? "default" : prev);
      }
    });
  }, [userKey, prefsMode, prefsRefreshTick]);

  useEffect(() => {
    const onPrefsUpdated = () => {
      prefsInitKeyRef.current = null;
      setSelectedIds(["", "", "", "", ""]);
      setPrefsPath(["", "", "", "", ""]);
      setLevels((prev) => [prev[0], [], [], [], []]);
      setPage(1);
      setPrefsMode(userKey ? "loading" : "default");
      setPrefsRefreshTick((tick) => tick + 1);
      clearApiCache("/api/notices");
    };
    return onAppEvent("supply-os:industry-prefs-updated", onPrefsUpdated);
  }, [userKey]);

  const prefsBannerName = useMemo(() => {
    const names: string[] = [];
    prefsPath.forEach((id, index) => {
      if (!id) return;
      const opt = levels[index]?.find((item) => String(item.id) === id);
      if (!opt) return;
      const title =
        locale === "zh"
          ? opt.title_zh || opt.title || opt.name
          : opt.title_i18n || opt.title_en || opt.title || opt.name || opt.title_zh;
      if (title) names.push(title);
    });
    return names.join(" / ");
  }, [levels, prefsPath, locale]);

  const exitAutoMode = () => {
    const mySeq = exitSeqRef.current + 1;
    exitSeqRef.current = mySeq;

    if (prefsMode === "prefs" && userKey) {
      fetchUnifiedSearch({ mode: "recommended", page: 1, pageSize: NOTICE_PAGE_SIZE })
        .then((probe) => {
          if (exitSeqRef.current !== mySeq) return;
          if (Number(probe.total || 0) > 0) {
            setPrefsMode("recommended");
          } else {
            setPrefsMode("default");
          }
        })
        .catch(() => { if (exitSeqRef.current === mySeq) setPrefsMode("default"); });
    } else if (prefsMode === "recommended" && userKey && hasIndustryPrefs) {
      if (exitSeqRef.current !== mySeq) return;
      setPrefsMode("prefs");
      void restorePrefsMode();
    } else {
      setPrefsMode("default");
    }
    setSelectedIds(["", "", "", "", ""]);
    setPrefsPath(["", "", "", "", ""]);
    setLevels((prev) => [prev[0], [], [], [], []]);
    setPage(1);
  };

  const deepestCodeId = useMemo(() => {
    for (let i = 2; i >= 0; i -= 1) {
      if (selectedIds[i]) return selectedIds[i];
    }
    return "";
  }, [selectedIds]);

  return {
    levels,
    setLevels,
    selectedIds,
    setSelectedIds,
    prefsMode,
    setPrefsMode,
    prefsBannerName,
    deepestCodeId,
    hasIndustryPrefs,
    exitAutoMode,
    handleLevelChange,
    restorePrefsMode,
  };
}
