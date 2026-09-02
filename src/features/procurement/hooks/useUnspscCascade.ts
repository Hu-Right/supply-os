/**
 * UNSPSC 级联选择 Hook
 * UNSPSC Cascade Selection Hook
 *
 * @module features/procurement/hooks/useUnspscCascade
 * @description ARCH-P3b（2026-08-31）：从 useIndustryPrefs.ts 拆分。
 *              管理 UNSPSC 5 级级联选择状态、初始加载、语言切换刷新、手动选择处理。
 */
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { UnspscOption } from "../types";
import { fetchUnspscIndustries, fetchUnspscChildren } from "@/core/unspsc/api";
import { readUnspscCache, writeUnspscCache } from "./industry-prefs/unspscCache";

export interface UseUnspscCascadeOptions {
  locale: string;
}

export interface UseUnspscCascadeReturn {
  levels: UnspscOption[][];
  setLevels: Dispatch<SetStateAction<UnspscOption[][]>>;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  handleLevelChange: (levelIndex: number, value: string) => Promise<void>;
}

export function useUnspscCascade({ locale }: UseUnspscCascadeOptions): UseUnspscCascadeReturn {
  const [levels, setLevels] = useState<Array<UnspscOption[]>>([[], [], [], [], []]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["", "", "", "", ""]);

  // 首次挂载时加载一级类目（industries）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = readUnspscCache(locale);
      if (cached) {
        if (!cancelled) {
          setLevels((prev) => {
            if (prev[0].length === 0) {
              return [cached, ...prev.slice(1)];
            }
            return prev;
          });
        }
        return;
      }
      try {
        const industries = await fetchUnspscIndustries(locale);
        if (!cancelled) {
          const arr = Array.isArray(industries) ? industries : [];
          if (arr.length > 0) writeUnspscCache(locale, arr);
          setLevels((prev) => {
            if (prev[0].length === 0) {
              return [arr, ...prev.slice(1)];
            }
            return prev;
          });
        }
      } catch {
        // 加载失败静默降级
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 切语言后按当前选择路径重拉各级选项
  const localeRef = useRef(locale);
  useEffect(() => {
    if (localeRef.current === locale) return;
    localeRef.current = locale;
    (async () => {
      const nextLevels: UnspscOption[][] = [[], [], [], [], []];
      try {
        const industries = await fetchUnspscIndustries(locale);
        nextLevels[0] = Array.isArray(industries) ? industries : [];
      } catch {
        nextLevels[0] = [];
      }
      for (let i = 0; i < 4 && selectedIds[i]; i += 1) {
        try {
          const children = await fetchUnspscChildren(selectedIds[i], locale);
          nextLevels[i + 1] = Array.isArray(children) ? children : [];
        } catch {
          nextLevels[i + 1] = [];
        }
      }
      setLevels(nextLevels);
    })();
  }, [locale, selectedIds]);

  const handleLevelChange = async (levelIndex: number, value: string) => {
    setSelectedIds((prev) => {
      const next = prev.map((id, index) => (index < levelIndex ? id : ""));
      next[levelIndex] = value;
      return next;
    });

    if (value && levelIndex < 4) {
      try {
        const children = await fetchUnspscChildren(value, locale);
        setLevels((prev) => {
          const next = prev.map((list, index) => (index <= levelIndex ? list : []));
          next[levelIndex + 1] = Array.isArray(children) ? children : [];
          return next;
        });
      } catch {
        setLevels((prev) => {
          const next = prev.map((list, index) => (index <= levelIndex ? list : []));
          next[levelIndex + 1] = [];
          return next;
        });
      }
    } else {
      setLevels((prev) => prev.map((list, index) => (index <= levelIndex ? list : [])));
    }
  };

  return {
    levels,
    setLevels,
    selectedIds,
    setSelectedIds,
    handleLevelChange,
  };
}
