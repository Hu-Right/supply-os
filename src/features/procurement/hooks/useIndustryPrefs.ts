/**
 * 行业偏好 Hook
 * Industry Preferences Hook
 *
 * @module features/procurement/hooks/useIndustryPrefs
 * @description 账号默认行业偏好三级降级（偏好 → 推荐 → 全量）、UNSPSC 五级级联
 *              选择状态与 supply-os:industry-prefs-updated 事件订阅。
 *              Account default industry preference three-tier fallback
 *              (prefs → recommended → default), UNSPSC 5-level cascade
 *              state and supply-os:industry-prefs-updated subscription.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { onAppEvent } from "@/core/events";
import type { UnspscOption, NoticeItem, PrefsMode } from "../types";
import { fetchIndustryPrefs } from "@/core/api/industry-prefs";
import { fetchUnspscIndustries, fetchUnspscChildren } from "@/core/unspsc/api";
import { fetchRecommendedNotices } from "../api";
import { PAGE_SIZE } from "./useNoticeSearch";

// P1 性能优化：UNSPSC 一级类目 sessionStorage 缓存（10 分钟 TTL，按 locale 分键）
// 与国家/机构下拉缓存策略一致，避免每次进入采购页重复请求
// 回滚：删除 UNSPSC_INDUSTRIES_CACHE_KEY / UNSPSC_CACHE_TTL / readUnspscCache / writeUnspscCache
const UNSPSC_INDUSTRIES_CACHE_KEY = "supply-os:unspsc-industries";
const UNSPSC_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

function readUnspscCache(locale: string): UnspscOption[] | null {
  try {
    const raw = sessionStorage.getItem(`${UNSPSC_INDUSTRIES_CACHE_KEY}:${locale}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > UNSPSC_CACHE_TTL) {
      sessionStorage.removeItem(`${UNSPSC_INDUSTRIES_CACHE_KEY}:${locale}`);
      return null;
    }
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function writeUnspscCache(locale: string, data: UnspscOption[]): void {
  try {
    sessionStorage.setItem(`${UNSPSC_INDUSTRIES_CACHE_KEY}:${locale}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota */ }
}

export interface UseIndustryPrefsOptions {
  /** 当前登录用户 key，未登录直接回 default 全量 */
  userKey: string | undefined;
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

  const [levels, setLevels] = useState<Array<UnspscOption[]>>([[], [], [], [], []]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["", "", "", "", ""]);

  // ── 账号默认行业偏好三级降级（本地差异 #5 配套前端）──
  // 未登录直接 default（行为零变化）；已登录先探测偏好 → 推荐 → 全量
  const [prefsMode, setPrefsMode] = useState<PrefsMode>(() => (userKey ? "loading" : "default"));
  // 账号是否已设置默认行业偏好（"恢复行业匹配"按钮显示条件；探测后确认）
  const [hasIndustryPrefs, setHasIndustryPrefs] = useState(false);
  // 记录已探测过的账号：布尔锁会漏掉"登出→换号"场景，按 userKey 判重才能给新账号重新探测
  const prefsInitKeyRef = useRef<string | null>(null);
  // 偏好变更事件的重探测信号量：prefsMode 可能已是 loading（setState 同值不触发 effect），
  // 递增 tick 才能保证探测 effect 必定重跑，不会卡死在 loading
  const [prefsRefreshTick, setPrefsRefreshTick] = useState(0);

  /**
   * 按偏好路径预选级联并切 prefs 模式（探测与"恢复行业匹配"共用）。
   * 偏好加载时包含 L1+L2+L3（UI 可见层级），与手动选择的深度对齐。
   * L4/L5 由 AI 推断自动填入，不是用户在 UI 中选择的，忽略（path[3]/path[4] = null）。
   */
  const applyPrefsPath = async (prefs: { level1_id?: number | null; level2_id?: number | null; level3_id?: number | null }) => {
    const path = [prefs.level1_id, prefs.level2_id, prefs.level3_id, null, null]
      .map((id) => (id ? String(id) : ""));
    // P0 性能优化：偏好级联并行化——4 级子类目请求同时发出，不再串行等待
    // 回滚：将 Promise.all 改回 for 循环内逐个 await fetchUnspscChildren(...)
    const childRequests: Promise<UnspscOption[]>[] = [];
    for (let i = 0; i < 4 && path[i]; i += 1) {
      childRequests.push(fetchUnspscChildren(path[i], locale).catch(() => []));
    }
    const childResults = await Promise.all(childRequests);
    const nextChildren: UnspscOption[][] = [[], [], [], []];
    for (let i = 0; i < childResults.length; i += 1) {
      nextChildren[i] = Array.isArray(childResults[i]) ? childResults[i] : [];
    }
    setLevels((prev) => [prev[0], nextChildren[0], nextChildren[1], nextChildren[2], nextChildren[3]]);
    setSelectedIds(path);
    setPrefsMode("prefs");
  };

  /**
   * 恢复行业匹配：清除手动搜索条件后切回行业精准匹配模式。
   * 乐观切换 prefs（立即回到行业匹配数据源），随后拉取偏好填充级联；
   * 无偏好/请求失败时回退 default（按钮仅在 hasIndustryPrefs 时显示，属防御分支）。
   */
  const restorePrefsMode = async () => {
    if (!userKey) return;
    setPage(1);
    setPrefsMode("prefs");
    try {
      const prefs = await fetchIndustryPrefs(userKey);
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

  useEffect(() => {
    if (!userKey) {
      // 登出：清掉上一账号的自动筛选残留（预选 + 提示条），回未登录全量现状
      prefsInitKeyRef.current = null;
      setHasIndustryPrefs(false);
      if (prefsMode !== "default") {
        setPrefsMode("default");
        setSelectedIds(["", "", "", "", ""]);
        setLevels((prev) => [prev[0], [], [], [], []]);
        setPage(1);
      }
      return;
    }
    if (prefsInitKeyRef.current === userKey) return;
    prefsInitKeyRef.current = userKey;
    // 同步标记 loading：userKey 变化（登录/注册/换号）时立即将 prefsMode 置为 "loading"，
    // 使 useNoticeSearch 的 loading 守卫生效（不发全量请求），避免 userKey 未入 deps 时
    // effect 完全不重跑导致登录后卡片消失。
    // 注意：若 prefsMode 已是 "loading"（如初始挂载），setState 同值不触发重渲染，无副作用。
    if (prefsMode !== "loading") setPrefsMode("loading");
    // 过期判定用 ref 而非 cleanup 标志：StrictMode 双执行下 cleanup 会把首轮探测
    // 全部作废、次轮又被判重拦截，导致 prefsMode 永远卡在 loading（公告不加载）
    // BUG 修复：探测超时兜底——fetch() 无内置超时，API 挂起时 prefsMode 永远卡在 "loading"，
    // 导致 useNoticeSearch 的 loading 守卫阻止所有搜索请求，页面永久骨架屏
    // 回滚：删除 detect() 函数与 Promise.race，恢复原始 (async () => { ... })() IIFE
    const stale = () => prefsInitKeyRef.current !== userKey;
    const detect = async () => {
      try {
        const prefs = await fetchIndustryPrefs(userKey);
        if (stale()) return;
        if (prefs?.level1_id) {
          // S0 有账号偏好：预选级联路径，切行业精准匹配数据源（方案 A）
          // applyPrefsPath 包含 L1+L2+L3（UI 可见层级），与手动选择的深度对齐。
          // L4/L5 由 AI 推断自动填入，不是用户在 UI 中选择的，因此忽略。
          setHasIndustryPrefs(true);
          await applyPrefsPath(prefs);
          return;
        }
        setHasIndustryPrefs(false);
        // S1 无偏好：探测行为兴趣推荐，有结果则切推荐数据源
        try {
          const probe = await fetchRecommendedNotices({ userKey, page: 1, pageSize: PAGE_SIZE });
          if (stale()) return;
          if (Number(probe.total || 0) > 0) {
            setPrefsMode("recommended");
            return;
          }
        } catch {
          // 推荐接口异常同样回退全量
        }
        // S2 双空：现状全量列表
        if (!stale()) setPrefsMode("default");
      } catch {
        // fetchIndustryPrefs 异常（网络/服务端错误）：回退全量，避免 prefsMode 永远卡在 loading
        if (!stale()) setPrefsMode("default");
      }
    };
    // 10 秒超时兜底：超时后回退全量列表，避免页面永久骨架屏
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    Promise.race([detect(), timeout]).then(() => {
      if (!stale() && prefsInitKeyRef.current === userKey) {
        // 超时触发时 detect() 可能仍在运行；此处仅当 detect 未自行完成时回退
        // 由于 Promise.race 先 resolve 的一定是先到者，detect 先完成则已设正确 mode，
        // timeout 先到则 prefsMode 仍为 "loading"，此时回退 "default"
        setPrefsMode((prev) => prev === "loading" ? "default" : prev);
      }
    });
    // prefsMode 入依赖仅服务登出清理分支；已登录路径有 prefsInitKeyRef 判重，不会重复探测；
    // prefsRefreshTick 由偏好变更事件递增，强制清锁后重新探测
  }, [userKey, prefsMode, prefsRefreshTick]);

  // 账号弹窗中保存/清除默认行业后广播 supply-os:industry-prefs-updated：
  // 同页打开弹窗时组件不卸载、userKey 不变，判重锁会拦住重新探测，
  // 故收到事件后清锁 + 清残留预选 + 回 loading + ��增 tick，让上方探测 effect 按新偏好重跑
  useEffect(() => {
    const onPrefsUpdated = () => {
      prefsInitKeyRef.current = null;
      setSelectedIds(["", "", "", "", ""]);
      setLevels((prev) => [prev[0], [], [], [], []]);
      setPage(1);
      setPrefsMode(userKey ? "loading" : "default");
      setPrefsRefreshTick((tick) => tick + 1);
    };
    return onAppEvent("supply-os:industry-prefs-updated", onPrefsUpdated);
  }, [userKey]);

  // 提示条中展示的偏好类目名（一级/二级名按 locale 取词，多级用 / 连接）
  const prefsBannerName = useMemo(() => {
    const names: string[] = [];
    selectedIds.forEach((id, index) => {
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
  }, [levels, selectedIds, locale]);

  // 「查看全部」/手动改筛选：退出自动模式，回到现状全量列表
  const exitAutoMode = () => {
    setPrefsMode("default");
    setSelectedIds(["", "", "", "", ""]);
    setLevels((prev) => [prev[0], [], [], [], []]);
    setPage(1);
  };

  const deepestCodeId = useMemo(() => {
    // 只考虑前 3 级（UI 可选层级），忽略智能推断的 L4/L5
    // L4/L5 由 AI 推断自动填入，不是用户在 UI 中选择的，
    // 用于搜索筛选会导致结果过于精确（如 1 条 vs 871 条）
    for (let i = 2; i >= 0; i -= 1) {
      if (selectedIds[i]) return selectedIds[i];
    }
    return "";
  }, [selectedIds]);

  // 首次挂载时加载一级类目（industries）：语言切换 effect 的 localeRef 守卫会跳过首次挂载，
  // 因此需要独立的初始加载 effect 保证 levels[0] 有数据，用户才能看到一级分类下拉选项。
  // P1 性能优化：缓存优先——sessionStorage 命中时直接使用，避免重复 API 请求
  // 回滚：删除 readUnspscCache/writeUnspscCache 调用，恢复原始直接 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 缓存命中：同步填充，0ms 等待
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
      // 缓存未命中：请求 API 并写入缓存
      try {
        const industries = await fetchUnspscIndustries(locale);
        if (!cancelled) {
          const arr = Array.isArray(industries) ? industries : [];
          if (arr.length > 0) writeUnspscCache(locale, arr);
          setLevels((prev) => {
            // 仅当 levels[0] 为空时才填充，避免覆盖偏好级联已设的值
            if (prev[0].length === 0) {
              return [arr, ...prev.slice(1)];
            }
            return prev;
          });
        }
      } catch {
        // 加载失败静默降级：一级下拉为空，用户仍可搜索/浏览
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 切语言后按当前选择路径重拉各级选项：fr/ru/es/ar 的选项译文由后端按 lang 返回，
  // 必须重新请求才能刷新文案。localeRef 守卫保证仅语言变化时触发（挂载与选级联不重拉）
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
    // 用户手动操作任一级筛选：立即退出 prefs/recommended 自动模式（提示条消失，会话内按手动为准）
    if (prefsMode !== "default") setPrefsMode("default");
    // BUG2 修复：使用函数式更新确保基于最新状态，避免快速连击竞态
    setSelectedIds((prev) => {
      const next = prev.map((id, index) => (index < levelIndex ? id : ""));
      next[levelIndex] = value;
      return next;
    });
    setPage(1);
    setSelectedNotice(null);

    if (value && levelIndex < 4) {
      try {
        const children = await fetchUnspscChildren(value, locale);
        // BUG2 修复：函数式更新 levels，基于最新状态截断下级并填充子级
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
      // 无值或已到最深层：截断下级
      setLevels((prev) => prev.map((list, index) => (index <= levelIndex ? list : [])));
    }
  };

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
