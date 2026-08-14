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
  /** 根据智能推断结果自动填充级联选择器（L1→L2） */
  autoFillFromInference: (path: SmartInferResult) => void;
  /** 基于关键词在当前二级分类的三级子类中搜索并自动选中最佳匹配 */
  searchAndAutoFillL3: (keyword: string) => void;
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

  // 主营业务搜索关键词（供 L2 变更时自动匹配 L3 使用）
  const keywordRef = useRef("");

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

  /** 根据关键词在当前二级分类的三级子类中搜索最佳匹配并自动选中。
   *  匹配策略：完整子串 > 单字符匹配 > 最短标题优先。
   */
  const searchAndAutoFillL3 = useCallback(
    (keyword: string) => {
      keywordRef.current = keyword;
      if (!prefLevel2 || !keyword.trim() || subOptions.length === 0) return;
      const kw = keyword.trim();
      const kwLower = kw.toLowerCase();
      // 完整子串匹配（中文直接包含，英文忽略大小写）
      const exact = subOptions.filter(
        (o) =>
          o.title_zh.includes(kw) ||
          o.title.toLowerCase().includes(kwLower),
      );
      if (exact.length > 0) {
        exact.sort((a, b) => {
          const ai = a.title_zh.includes(kw)
            ? a.title_zh.indexOf(kw)
            : a.title.toLowerCase().indexOf(kwLower);
          const bi = b.title_zh.includes(kw)
            ? b.title_zh.indexOf(kw)
            : b.title.toLowerCase().indexOf(kwLower);
          if (ai !== bi) return ai - bi;
          return a.title_zh.length - b.title_zh.length;
        });
        setPrefLevel3(String(exact[0].id));
        return;
      }
      // 拆字匹配：所有中文字符都出现在标题中
      const chars = [...new Set(kw.replace(/[\s\x00-\x7f]/g, ""))].filter(Boolean);
      if (chars.length >= 2) {
        const matches = subOptions.filter((o) =>
          chars.every((c) => o.title_zh.includes(c)),
        );
        if (matches.length > 0) {
          matches.sort((a, b) => a.title_zh.length - b.title_zh.length);
          setPrefLevel3(String(matches[0].id));
          return;
        }
      }
      // 无匹配：不清除已有的 L3 选择，保留用户手动选择
    },
    [prefLevel2, subOptions],
  );

  // 当二级子类目加载完成且有关键词时，自动搜索并填充三级分类
  useEffect(() => {
    if (keywordRef.current && prefLevel2 && subOptions.length > 0) {
      searchAndAutoFillL3(keywordRef.current);
    }
  }, [prefLevel2, subOptions, searchAndAutoFillL3]);

  /** 根据智能推断结果自动填充级联选择器。
   *  仅填充 L1→L2；L3 由 searchAndAutoFillL3 基于关键词自动匹配。
   *  由于 L2 选项依赖 L1 的 useEffect 加载，
   *  用 setTimeout 确保子类目加载后再设置下一级。
   */
  const autoFillFromInference = (path: SmartInferResult) => {
    if (!path.level1_id) return;
    setPrefLevel1(String(path.level1_id));
    if (path.level2_id) {
      setTimeout(() => {
        setPrefLevel2(String(path.level2_id));
      }, 150);
    }
  };

  /** 重置所有级联状态（切换账号时调用） */
  const resetCascade = useCallback(() => {
    setPrefLevel1("");
    setPrefLevel2("");
    setPrefLevel3("");
    setSubOptions([]);
    setSubOptions2([]);
    keywordRef.current = "";
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
    autoFillFromInference,
    searchAndAutoFillL3,
    resetCascade,
  };
}
