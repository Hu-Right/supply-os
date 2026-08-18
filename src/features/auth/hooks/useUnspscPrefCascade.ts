/**
 * UNSPSC 行业偏好三级级联 Hook
 * UNSPSC Industry Preference Cascade Hook
 *
 * @module features/auth/hooks/useUnspscPrefCascade
 * @description 注册表单与已登录面板共用的三级级联状态：选项加载（locale 切换
 *              重拉译文）与级变更处理（改一级清二/三级、改二级清三级）。
 *              推断路径回填采用"待填队列 + 选项加载后消费"的确定性方案，
 *              替代旧版 setTimeout(150ms) 赌加载时序的竞态写法。
 *              Shared three-level cascade state for the register form and the
 *              account panel: option loading (reload on locale switch) and
 *              level-change handlers (level-1 change clears levels 2/3, etc.).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";
import {
  fetchUnspscIndustries,
  fetchUnspscChildren,
  type UnspscOption,
  type SmartInferResult,
} from "@/core/unspsc";

export interface UseUnspscPrefCascadeReturn {
  industryOptions: UnspscOption[];
  subOptions: UnspscOption[];
  subOptions2: UnspscOption[];
  prefLevel1: string;
  prefLevel2: string;
  prefLevel3: string;
  setPrefLevel1: (value: string) => void;
  setPrefLevel2: (value: string) => void;
  setPrefLevel3: (value: string) => void;
  handlePrefLevel1Change: (value: string) => void;
  handlePrefLevel2Change: (value: string) => void;
  /** 按推断路径确定性回填级联（L1→L2→L3）：各级在对应选项加载完成且包含目标 id 后才写入 */
  applyInferredPath: (path: SmartInferResult) => void;
  /** 重置所有级联状态（切换账号时调用） */
  resetCascade: () => void;
}

export function useUnspscPrefCascade(): UseUnspscPrefCascadeReturn {
  const { locale } = useLocale();

  const [industryOptions, setIndustryOptions] = useState<UnspscOption[]>([]);
  const [subOptions, setSubOptions] = useState<UnspscOption[]>([]);
  const [subOptions2, setSubOptions2] = useState<UnspscOption[]>([]);
  const [prefLevel1, setPrefLevel1] = useState("");
  const [prefLevel2, setPrefLevel2] = useState("");
  const [prefLevel3, setPrefLevel3] = useState("");

  // 推断路径待填队列（按目标 L1 隔离）：
  // applyInferredPath 将 L2/L3 待填值存入 Map，键为推断路径的 L1 id。
  // 消费在 fetch 回调中直接完成（而非额外 effect），消除 effect 调度链的时序不确定性。
  const pendingMapRef = useRef<Map<string, { l2: string | null; l3: string | null }>>(new Map());

  // 一级行业选项：接口有缓存，弹窗打开即加载；locale 入依赖，切语言重拉界面语言译文
  useEffect(() => {
    fetchUnspscIndustries(locale)
      .then(setIndustryOptions)
      .catch(() => setIndustryOptions([]));
  }, [locale]);

  // 选定一级后加载二级细分类目；选项就绪后立即消费待填 L2
  useEffect(() => {
    if (!prefLevel1) {
      setSubOptions([]);
      return;
    }
    const l1Key = prefLevel1;
    fetchUnspscChildren(l1Key, locale)
      .then((opts) => {
        setSubOptions(opts);
        // 选项就绪 → 立即查找并消费当前 L1 的待填 L2
        const entry = pendingMapRef.current.get(l1Key);
        if (!entry?.l2) return;
        if (opts.some((o) => String(o.id) === entry.l2)) {
          setPrefLevel2(entry.l2);
        } else {
          entry.l3 = null; // L2 不在此子树中 → L3 也失效
        }
        entry.l2 = null;
      })
      .catch(() => {
        pendingMapRef.current.delete(l1Key);
        setSubOptions([]);
      });
  }, [prefLevel1, locale]);

  // 选定二级后加载三级类目（可选级）；选项就绪后立即消费待填 L3
  useEffect(() => {
    if (!prefLevel2) {
      setSubOptions2([]);
      return;
    }
    const l1Key = prefLevel1;
    const l2Key = prefLevel2;
    fetchUnspscChildren(l2Key, locale)
      .then((opts) => {
        setSubOptions2(opts);
        // 选项就绪 → 立即查找并消费待填 L3
        const entry = pendingMapRef.current.get(l1Key);
        if (!entry?.l3) return;
        if (opts.some((o) => String(o.id) === entry.l3)) {
          setPrefLevel3(entry.l3);
        }
        entry.l3 = null;
      })
      .catch(() => {
        const entry = pendingMapRef.current.get(l1Key);
        if (entry) entry.l3 = null;
        setSubOptions2([]);
      });
  }, [prefLevel2, locale]);

  const handlePrefLevel1Change = (value: string) => {
    // 手动改选优先于推断：清除所有待填项
    pendingMapRef.current.clear();
    setPrefLevel1(value);
    setPrefLevel2("");
    setPrefLevel3("");
  };

  const handlePrefLevel2Change = (value: string) => {
    // 清除当前 L1 的 L3 待填
    const entry = pendingMapRef.current.get(prefLevel1);
    if (entry) entry.l3 = null;
    setPrefLevel2(value);
    setPrefLevel3("");
  };

  /** 按推断路径确定性回填级联：L1 立即写入，L2/L3 按 L1 键存入待填 Map，
   *  由上方 fetch 回调在选项就绪后直接消费。
   *  仅回填用户在 UI 可见的 L1~L3；推断出的 L4/L5 不进入级联也不持久化。
   */
  const applyInferredPath = useCallback((path: SmartInferResult) => {
    if (!path.level1_id) return;
    const l1Key = String(path.level1_id);
    pendingMapRef.current.set(l1Key, {
      l2: path.level2_id ? String(path.level2_id) : null,
      l3: path.level3_id ? String(path.level3_id) : null,
    });
    setPrefLevel1(l1Key);
    setPrefLevel2("");
    setPrefLevel3("");
  }, []);

  /** 重置所有级联状态（切换账号时调用） */
  const resetCascade = useCallback(() => {
    pendingMapRef.current.clear();
    setPrefLevel1("");
    setPrefLevel2("");
    setPrefLevel3("");
    setSubOptions([]);
    setSubOptions2([]);
  }, []);

  return {
    industryOptions,
    subOptions,
    subOptions2,
    prefLevel1,
    prefLevel2,
    prefLevel3,
    setPrefLevel1,
    setPrefLevel2,
    setPrefLevel3,
    handlePrefLevel1Change,
    handlePrefLevel2Change,
    applyInferredPath,
    resetCascade,
  };
}
