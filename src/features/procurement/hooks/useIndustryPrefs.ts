/**
 * 行业偏好 Hook（商机页「品目匹配」模式状态机）
 * Industry Preferences Hook
 *
 * @module features/procurement/hooks/useIndustryPrefs
 * @description 账号默认偏好二级降级（偏好 → 全量）与提示条名称。
 *              2026-10-11 五级下拉换成品目树后的收敛：本 hook **不再持有任何下拉选中态**
 *              （选中态的唯一事实源是 URL 的 group / commodity，见 useCommodityCascade），
 *              只保留模式判定与提示条。
 *
 *              提示条名称的来源也一并换源：偏好表存的是旧字典 `旧品类字典表` 的行 id
 *              （level=1 还是 A..J 十个字母容器，新分类里没有这一层），故经
 *              /api/commodity/tree/prefs 换算成品目树键 + 树内名称后再展示，
 *              不再直接拿字典 title 拼串（那会把「原材料 材料, 化学品, 纸张, 燃料」这类
 *              机器拼接名透到界面上）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAppEvent } from "@/core/events";
import { clearApiCache } from "@/core/http";
import { useLocale } from "@/core/i18n";
import type { PrefsMode } from "../types";
import { fetchIndustryPrefs } from "@/core/api/industry-prefs";
import { fetchCommodityPrefsPath, type CommodityTreeOption } from "../api/commodityTree";

export interface UseIndustryPrefsOptions {
  /** 当前登录用户 key，未登录直接回 default 全量 */
  userId: number | undefined;
  /** 页码设置器（自动筛选/手动改选时重置为 1） */
  setPage: (page: number) => void;
}

export interface UseIndustryPrefsReturn {
  prefsMode: PrefsMode;
  setPrefsMode: (mode: PrefsMode) => void;
  prefsBannerName: string;
  /** 账号是否已设置默认品目偏好（决定「恢复品目匹配」按钮显示） */
  hasIndustryPrefs: boolean;
  exitAutoMode: () => void;
  /** 清除手动搜索条件并切回品目匹配模式（无偏好时回退 default） */
  restorePrefsMode: () => Promise<void>;
  /** 用户手动改选品目分类：作废在飞的偏好探测结果，避免它把手动筛选盖回匹配模式 */
  markManualCategoryPick: () => void;
}

export function useIndustryPrefs(options: UseIndustryPrefsOptions): UseIndustryPrefsReturn {
  const { userId, setPage } = options;
  const { locale } = useLocale();

  // 品目匹配模式下的偏好路径（仅用于提示条展示品目名称；选中态在 URL 里）
  const [prefsPath, setPrefsPath] = useState<{
    options: CommodityTreeOption[];
  }>({ options: [] });

  // ── 账号默认品目偏好三级降级 ──
  const [prefsMode, setPrefsMode] = useState<PrefsMode>(() => (userId ? "loading" : "default"));
  const [hasIndustryPrefs, setHasIndustryPrefs] = useState(false);
  const prefsInitKeyRef = useRef<number | null>(null);
  const [prefsRefreshTick, setPrefsRefreshTick] = useState(0);
  const exitSeqRef = useRef(0);

  const markManualCategoryPick = useCallback(() => {
    exitSeqRef.current += 1;
  }, []);

  /**
   * 按偏好路径切 prefs 模式（偏好键为 UGT 最深节点码，经品目树换名称）
   */
  const applyPrefsPath = useCallback(async (prefs: {
    commodity_code?: string | null;
  }) => {
    const entrySeq = exitSeqRef.current;
    let resolved = { l1Code: null as string | null, options: [] as CommodityTreeOption[] };
    try {
      resolved = await fetchCommodityPrefsPath(prefs.commodity_code || "");
    } catch {
      // 换算失败不阻断匹配模式：筛选本身由服务端按画像层级完成，提示条只是少一行名字
    }
    if (exitSeqRef.current !== entrySeq) return;
    setPrefsPath({ options: resolved.options });
    setPrefsMode("prefs");
  }, []);

  /**
   * 恢复品目匹配
   */
  const restorePrefsMode = async () => {
    if (!userId) return;
    setPage(1);
    setPrefsMode("prefs");
    try {
      const prefs = await fetchIndustryPrefs();
      if (prefs?.commodity_code) {
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

  useEffect(() => {
    if (!userId) {
      prefsInitKeyRef.current = null;
      setHasIndustryPrefs(false);
      if (prefsMode !== "default") {
        setPrefsMode("default");
        setPrefsPath({ options: [] });
        setPage(1);
      }
      return;
    }
    if (prefsInitKeyRef.current === userId) return;
    prefsInitKeyRef.current = userId ?? null;
    if (prefsMode !== "loading") setPrefsMode("loading");
    const stale = () => prefsInitKeyRef.current !== userId;
    const detect = async () => {
      try {
        const prefs = await fetchIndustryPrefs();
        if (stale()) return;
        if (prefs?.commodity_code) {
          setHasIndustryPrefs(true);
          await applyPrefsPath(prefs);
          return;
        }
        setHasIndustryPrefs(false);
        if (!stale()) setPrefsMode("default");
      } catch {
        if (!stale()) setPrefsMode("default");
      }
    };
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    Promise.race([detect(), timeout]).then(() => {
      if (!stale() && prefsInitKeyRef.current === userId) {
        setPrefsMode((prev) => prev === "loading" ? "default" : prev);
      }
    });
  }, [userId, prefsMode, prefsRefreshTick, applyPrefsPath, setPage]);

  useEffect(() => {
    const onPrefsUpdated = () => {
      prefsInitKeyRef.current = null;
      setPrefsPath({ options: [] });
      setPage(1);
      setPrefsMode(userId ? "loading" : "default");
      setPrefsRefreshTick((tick) => tick + 1);
      clearApiCache("/api/notices");
    };
    return onAppEvent("supply-os:industry-prefs-updated", onPrefsUpdated);
  }, [userId, setPage]);

  const prefsBannerName = useMemo(() => {
    const names: string[] = [];
    for (const opt of prefsPath.options) {
      const title = locale === "zh"
        ? opt.nameZh || opt.nameEn || opt.key
        : opt.nameEn || opt.nameZh || opt.key;
      if (title) names.push(title);
    }
    return names.join(" / ");
  }, [prefsPath, locale]);

  const exitAutoMode = () => {
    exitSeqRef.current += 1;
    setPrefsMode("default");
    setPrefsPath({ options: [] });
    setPage(1);
  };

  return {
    prefsMode,
    setPrefsMode,
    prefsBannerName,
    hasIndustryPrefs,
    exitAutoMode,
    restorePrefsMode,
    markManualCategoryPick,
  };
}

