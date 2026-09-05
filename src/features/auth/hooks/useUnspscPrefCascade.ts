/**
 * UNSPSC 行业偏好三级级联 Hook
 * UNSPSC Industry Preference Cascade Hook
 *
 * @module features/auth/hooks/useUnspscPrefCascade
 * @description 注册表单与已登录面板共用的三级级联状态：选项加载（locale 切换
 *              重拉译文）与级变更处理（改一级清二/三级、改二级清三级）。
 *              推断路径回填采用"同步写值 + fetch 仅加载选项列表"方案：
 *              applyInferredPath 在调用瞬间同步写入 L1/L2/L3，状态立即正确，
 *              彻底消除"异步回填未完成即提交"导致的校验失败竞态。
 *              Shared three-level cascade state for the register form and the
 *              account panel: option loading (reload on locale switch) and
 *              level-change handlers (level-1 change clears levels 2/3, etc.).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  /** 按推断路径确定性回填级联（L1→L2→L3）：同步写入选中值，fetch 仅加载选项列表 */
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

  // 推断触发计数器：每次 applyInferredPath 递增，用作选项加载 effect 的额外依赖。
  // 解决关键场景：用户清空输入后重新输入，若两次推断命中同一 L1，
  // setPrefLevel1 是空操作（React bail out），选项加载 effect 不会重新触发。
  // inferredTick 确保即使 L1 不变也强制重新拉取选项列表。
  const [inferredTick, setInferredTick] = useState(0);

  // 一级行业选项：接口有缓存，弹窗打开即加载；locale 入依赖，切语言重拉界面语言译文
  useEffect(() => {
    fetchUnspscIndustries(locale)
      .then(setIndustryOptions)
      .catch(() => setIndustryOptions([]));
  }, [locale]);

  // 选定一级后加载二级选项（仅用于下拉展示，不改动已选值）
  useEffect(() => {
    if (!prefLevel1) {
      setSubOptions([]);
      return;
    }
    fetchUnspscChildren(prefLevel1, locale)
      .then(setSubOptions)
      .catch(() => setSubOptions([]));
  }, [prefLevel1, locale, inferredTick]);

  // 选定二级后加载三级选项（仅用于下拉展示，不改动已选值）
  useEffect(() => {
    if (!prefLevel2) {
      setSubOptions2([]);
      return;
    }
    fetchUnspscChildren(prefLevel2, locale)
      .then(setSubOptions2)
      .catch(() => setSubOptions2([]));
  }, [prefLevel2, locale]);

  // 手动改选一级：二/三级随之失效
  const handlePrefLevel1Change = useCallback((value: string) => {
    setPrefLevel1(value);
    setPrefLevel2("");
    setPrefLevel3("");
  }, []);

  // 手动改选二级：三级失效
  const handlePrefLevel2Change = useCallback((value: string) => {
    setPrefLevel2(value);
    setPrefLevel3("");
  }, []);

  /** 按推断路径同步回填 L1/L2/L3：状态在调用瞬间即正确，不依赖异步 fetch。
   *  fetch 只负责拉取选项列表供下拉展示，回显在选项加载后自动呈现。
   *  仅回填用户在 UI 可见的 L1~L3；推断出的 L4/L5 不进入级联也不持久化。
   */
  const applyInferredPath = useCallback((path: SmartInferResult) => {
    if (!path.level1_id) return;
    setPrefLevel1(String(path.level1_id));
    setPrefLevel2(path.level2_id ? String(path.level2_id) : "");
    setPrefLevel3(path.level3_id ? String(path.level3_id) : "");
    setInferredTick((t) => t + 1);
  }, []);

  /** 重置所有级联状态（切换账号时调用） */
  const resetCascade = useCallback(() => {
    setPrefLevel1("");
    setPrefLevel2("");
    setPrefLevel3("");
    setSubOptions([]);
    setSubOptions2([]);
  }, []);

  // ★ 依赖数组仅包含稳定的 useCallback 引用，不包含 state 值。
  // 若将 prefLevel1/2/3、industryOptions 等 state 值放入依赖，
  // 每次 state 变化都会产生新的 cascade 对象引用，
  // 导致 LoginRegisterForm 的 useEffect([auth.authMode, cascade]) 反复触发 resetCascade()，
  // 形成「state 变化 → cascade 引用变化 → resetCascade → state 清空 → 重新变化」的无限循环。
  return useMemo(() => ({
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
  }), [handlePrefLevel1Change, handlePrefLevel2Change, applyInferredPath, resetCascade]);
}
