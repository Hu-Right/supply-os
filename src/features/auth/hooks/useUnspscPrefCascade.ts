/**
 * UNSPSC 行业偏好三级级联 Hook
 * UNSPSC Industry Preference Cascade Hook
 *
 * @module features/auth/hooks/useUnspscPrefCascade
 * @description 注册表单与已登录面板共用的三级级联状态：选项加载（locale 切换
 *              重拉译文）与级变更处理（改一级清二/三级、改二级清三级）。
 *              Shared three-level cascade state for the register form and the
 *              account panel: option loading (reload on locale switch) and
 *              level-change handlers (level-1 change clears levels 2/3, etc.).
 */
import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import {
  fetchUnspscIndustries,
  fetchUnspscChildren,
  type UnspscOption,
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
}

export function useUnspscPrefCascade(): UseUnspscPrefCascadeReturn {
  const { locale } = useLocale();

  const [industryOptions, setIndustryOptions] = useState<UnspscOption[]>([]);
  const [subOptions, setSubOptions] = useState<UnspscOption[]>([]);
  const [subOptions2, setSubOptions2] = useState<UnspscOption[]>([]);
  const [prefLevel1, setPrefLevel1] = useState("");
  const [prefLevel2, setPrefLevel2] = useState("");
  const [prefLevel3, setPrefLevel3] = useState("");

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

  const handlePrefLevel1Change = (value: string) => {
    setPrefLevel1(value);
    setPrefLevel2("");
    setPrefLevel3("");
  };

  const handlePrefLevel2Change = (value: string) => {
    setPrefLevel2(value);
    setPrefLevel3("");
  };

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
  };
}
