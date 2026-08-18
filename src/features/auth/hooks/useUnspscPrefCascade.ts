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

  // 推断路径待填队列：L1 立即写入；L2/L3 等各自选项加载完成后再消费，
  // 避免旧版 setTimeout 固定延时与异步加载的时序竞态（选项未就绪时选中丢失）
  const pendingRef = useRef<{ l2: string | null; l3: string | null }>({ l2: null, l3: null });

  // 一级行业选项：接口有缓存，弹窗打开即加载；locale 入依赖，切语言重拉界面语言译文
  useEffect(() => {
    fetchUnspscIndustries(locale)
      .then(setIndustryOptions)
      .catch(() => setIndustryOptions([]));
  }, [locale]);

  // 选定一级后加载二级细分类目
  useEffect(() => {
    if (!prefLevel1) {
      setSubOptions([]);
      return;
    }
    fetchUnspscChildren(prefLevel1, locale)
      .then(setSubOptions)
      .catch(() => setSubOptions([]));
  }, [prefLevel1, locale]);

  // 选定二级后加载三级类目（可选级，与 UnspscSelector 的逐级下钻一致）
  useEffect(() => {
    if (!prefLevel2) {
      setSubOptions2([]);
      return;
    }
    fetchUnspscChildren(prefLevel2, locale)
      .then(setSubOptions2)
      .catch(() => setSubOptions2([]));
  }, [prefLevel2, locale]);

  // 二级选项就绪后消费待填 L2：仅当选项列表包含目标 id 才写入；
  // 加载完成但找不到（推断路径与类目树不一致）则丢弃待填，避免写入脏 id
  useEffect(() => {
    const pendingL2 = pendingRef.current.l2;
    if (!pendingL2 || subOptions.length === 0) return;
    if (subOptions.some((o) => String(o.id) === pendingL2)) {
      setPrefLevel2(pendingL2);
    } else {
      pendingRef.current.l3 = null; // L2 失效则 L3 必然失效
    }
    pendingRef.current.l2 = null;
  }, [subOptions]);

  // 三级选项就绪后消费待填 L3（同上，含存在性校验）
  useEffect(() => {
    const pendingL3 = pendingRef.current.l3;
    if (!pendingL3 || subOptions2.length === 0) return;
    if (subOptions2.some((o) => String(o.id) === pendingL3)) {
      setPrefLevel3(pendingL3);
    }
    pendingRef.current.l3 = null;
  }, [subOptions2]);

  const handlePrefLevel1Change = (value: string) => {
    // 手动改选优先于推断：丢弃未消费的待填项
    pendingRef.current = { l2: null, l3: null };
    setPrefLevel1(value);
    setPrefLevel2("");
    setPrefLevel3("");
  };

  const handlePrefLevel2Change = (value: string) => {
    pendingRef.current.l3 = null;
    setPrefLevel2(value);
    setPrefLevel3("");
  };

  /** 按推断路径确定性回填级联：L1 立即写入，L2/L3 入待填队列由上方 effect 消费。
   *  仅回填用户在 UI 可见的 L1~L3；推断出的 L4/L5 不进入级联也不持久化。
   */
  const applyInferredPath = useCallback((path: SmartInferResult) => {
    if (!path.level1_id) return;
    pendingRef.current = {
      l2: path.level2_id ? String(path.level2_id) : null,
      l3: path.level3_id ? String(path.level3_id) : null,
    };
    setPrefLevel1(String(path.level1_id));
    setPrefLevel2("");
    setPrefLevel3("");
  }, []);

  /** 重置所有级联状态（切换账号时调用） */
  const resetCascade = useCallback(() => {
    pendingRef.current = { l2: null, l3: null };
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
