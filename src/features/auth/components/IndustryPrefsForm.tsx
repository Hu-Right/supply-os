/**
 * 账号默认行业偏好表单
 * Account Industry Preference Form
 *
 * @module features/auth/components/IndustryPrefsForm
 * @description 已登录面板的默认行业管理卡片：UNSPSC 三级级联（经
 *              useUnspscPrefCascade），进入回填已保存偏好，保存/清除成功后
 *              广播 supply-os:industry-prefs-updated 供公采页重新探测。
 *              Industry preference card in the account panel: UNSPSC cascade,
 *              backfill saved prefs on mount, broadcast change event after
 *              save/clear so the procurement page re-probes.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { fetchIndustryPrefs, saveIndustryPrefs } from "@/core/api/industry-prefs";
import { useUnspscPrefCascade } from "../hooks/useUnspscPrefCascade";
import { UnspscPrefSelects } from "./UnspscPrefSelects";
import { fetchSmartInferUnspsc, type SmartInferResult } from "@/core/unspsc";
import { Input } from "@/shared/ui";

export interface IndustryPrefsFormProps {}

/** 我的默认行业（本地差异 #5 配套 UI），内部经 useAuth 取 userKey，不接受 props 透传用户 */
export function IndustryPrefsForm() {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const {
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
  } = useUnspscPrefCascade();

  // 主营业务智能推断状态（按用户隔离 localStorage key）
  const mbKey = authUser?.user_key ? `supply-os:main-business:${authUser.user_key}` : "";
  const [mainBusiness, setMainBusinessRaw] = useState(
    () => (mbKey ? localStorage.getItem(mbKey) || "" : ""),
  );
  const setMainBusiness = (v: string) => {
    setMainBusinessRaw(v);
    if (mbKey) localStorage.setItem(mbKey, v);
  };
  const [inferResult, setInferResult] = useState<SmartInferResult | null>(null);
  const [inferLoading, setInferLoading] = useState(false);
  const [inferSearched, setInferSearched] = useState(false);
  // 关键词 ref：供 L2 变更时自动搜索 L3 使用
  const keywordRef = useRef("");

  const [prefMessage, setPrefMessage] = useState("");
  const [prefMessageIsError, setPrefMessageIsError] = useState(false);

  // 切换账号时：先重置全部状态，再回填新用户偏好
  useEffect(() => {
    // 重置级联选择器、推断状态、主营业务关键词
    resetCascade();
    setMainBusinessRaw("");
    setInferResult(null);
    setInferSearched(false);
    keywordRef.current = "";
    setPrefMessage("");

    const userKey = authUser?.user_key;
    if (!userKey) return;

    // 回填当前用户的 localStorage 关键词
    const savedMb = localStorage.getItem(`supply-os:main-business:${userKey}`);
    if (savedMb) setMainBusinessRaw(savedMb);

    // 从后端加载已保存的行业偏好
    fetchIndustryPrefs(userKey).then((prefs) => {
      setPrefLevel1(prefs?.level1_id ? String(prefs.level1_id) : "");
      setPrefLevel2(prefs?.level2_id ? String(prefs.level2_id) : "");
      setPrefLevel3(prefs?.level3_id ? String(prefs.level3_id) : "");
    });
  }, [authUser?.user_key, resetCascade]);

  // 防抖推断（300ms）：用户输入主营业务关键词后自动匹配 UNSPSC 类目路径
  useEffect(() => {
    if (mainBusiness.trim().length < 1) {
      setInferResult(null);
      setInferSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setInferLoading(true);
      setInferSearched(false);
      try {
        const data = await fetchSmartInferUnspsc(mainBusiness.trim());
        if (data?.result) {
          setInferResult(data.result);
          autoFillFromInference(data.result);
        } else {
          setInferResult(null);
        }
        setInferSearched(true);
      } catch {
        // 推断失败不影响保存流程
      } finally {
        setInferLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mainBusiness, autoFillFromInference]);

  // 关键词或 L2 变更时，自动在三级子类中搜索匹配项
  useEffect(() => {
    keywordRef.current = mainBusiness.trim();
    if (keywordRef.current && prefLevel2) {
      searchAndAutoFillL3(keywordRef.current);
    }
  }, [mainBusiness, prefLevel2, searchAndAutoFillL3]);

  const handleLevel1 = (value: string) => {
    handlePrefLevel1Change(value);
    setPrefMessage("");
  };

  const handleLevel2 = (value: string) => {
    handlePrefLevel2Change(value);
    setPrefMessage("");
  };

  const handleLevel3 = (value: string) => {
    setPrefLevel3(value);
    setPrefMessage("");
  };

  /** 已登录面板：保存当前选择为账号默认行业（前两级必选） */
  const savePrefs = async () => {
    if (!authUser?.user_key || !prefLevel1 || !prefLevel2) return;
    try {
      // 修复：仅持久化表单可见的 1~3 级。level4/5_id 来自主营业务智能推断的
      // 隐藏深层类目（表单不可见、不可编辑），持久化后会导致页面刷新按
      // level4/5_id 筛选（极窄），与手动选择 1~2 级（level2_id 宽口径）
      // 的搜索结果不一致；且用户手动改选 L1/L2 后 inferResult 为陈旧状态，
      // 会写入跨分支的混合路径。
      await saveIndustryPrefs(authUser.user_key, {
        level1_id: Number(prefLevel1),
        level2_id: Number(prefLevel2),
        level3_id: prefLevel3 ? Number(prefLevel3) : null,
        level4_id: null,
        level5_id: null,
      });
      // api() 在非 2xx 时抛出 ApiError，成功即代表保存 OK
      setPrefMessageIsError(false);
      setPrefMessage(t("authIndustryPrefSaved"));
      // 广播偏好已变更：公采页监听后按新偏好重新探测筛选（失败路径不广播）
      emitAppEvent("supply-os:industry-prefs-updated");
    } catch (err) {
      console.error("Failed to save industry prefs", err);
      setPrefMessageIsError(true);
      setPrefMessage(t("authIndustryPrefFailed"));
    }
  };

  /** 已登录面板：清除账号默认行业（level1 传空即删除） */
  const clearPrefs = async () => {
    if (!authUser?.user_key) return;
    try {
      await saveIndustryPrefs(authUser.user_key, { level1_id: null });
      // 仅在后端确认清除后才复位本地选择，失败时保留原偏好显示
      setPrefLevel1("");
      setPrefLevel2("");
      setPrefLevel3("");
      setMainBusiness("");
      if (mbKey) localStorage.removeItem(mbKey);
      setInferResult(null);
      setInferSearched(false);
      setPrefMessageIsError(false);
      setPrefMessage(t("authIndustryPrefCleared"));
      // 广播偏好已清除：公采页监听后退出偏好筛选回全量
      emitAppEvent("supply-os:industry-prefs-updated");
    } catch (err) {
      console.error("Failed to clear industry prefs", err);
      setPrefMessageIsError(true);
      setPrefMessage(t("authIndustryPrefFailed"));
    }
  };

  return (
    /* 我的默认行业 — 公采页进入时按此偏好默认筛选（本地差异 #5 配套 UI） */
    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-extrabold text-slate-900">
          {t("authIndustryPrefLabel")}
        </h4>
        <p className="text-[11px] text-slate-400">
          {t("authIndustryPrefRequiredHint")}
        </p>
      </div>
      {/* 主营业务智能推断 + 三级分类选择 */}
      <div className="mt-3">
        <Input
          type="text"
          value={mainBusiness}
          onChange={(e) => setMainBusiness(e.target.value)}
          placeholder={t("authMainBusinessPlaceholder")}
          className="bg-white"
        />
        {inferLoading && (
          <p className="mt-1 text-[11px] text-slate-400">{t("authMainBusinessMatching") || "匹配中..."}</p>
        )}
        {inferResult && !inferLoading && (
          <p className="mt-1 text-[11px] text-teal-600">
            {t("authMainBusinessInferred")}: {inferResult.matched_title}
          </p>
        )}
        {!inferResult && inferSearched && !inferLoading && (
          <p className="mt-1 text-[11px] text-amber-600">
            {t("authMainBusinessNoMatch")}
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <UnspscPrefSelects
          industryOptions={industryOptions}
          subOptions={subOptions}
          subOptions2={subOptions2}
          prefLevel1={prefLevel1}
          prefLevel2={prefLevel2}
          prefLevel3={prefLevel3}
          onLevel1Change={handleLevel1}
          onLevel2Change={handleLevel2}
          onLevel3Change={handleLevel3}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={savePrefs}
          disabled={!prefLevel1 || !prefLevel2}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-black shadow-xs hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-teal-600"
        >
          {t("authIndustryPrefSave")}
        </button>
        <button
          type="button"
          onClick={clearPrefs}
          className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
        >
          {t("authIndustryPrefClear")}
        </button>
        {/* 未选满前两级时按钮旁给出引导，选满后自动消失 */}
        {(!prefLevel1 || !prefLevel2) && (
          <p className="text-xs font-bold text-amber-600">
            {t("authIndustryPrefSaveHint")}
          </p>
        )}
      </div>
      {prefMessage && (
        <p
          className={`mt-3 text-xs font-bold rounded-lg p-3 border ${
            prefMessageIsError
              ? "text-rose-600 bg-rose-50 border-rose-100"
              : "text-teal-700 bg-teal-50 border-teal-100"
          }`}
        >
          {prefMessage}
        </p>
      )}
    </div>
  );
}
