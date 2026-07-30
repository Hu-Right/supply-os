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
import { useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import {
  fetchIndustryPrefs,
  saveIndustryPrefs,
} from "@/features/procurement";
import { useUnspscPrefCascade } from "../hooks/useUnspscPrefCascade";
import { UnspscPrefSelects } from "./UnspscPrefSelects";

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
  } = useUnspscPrefCascade();

  const [prefMessage, setPrefMessage] = useState("");
  const [prefMessageIsError, setPrefMessageIsError] = useState(false);

  // 已登录时回填已保存的偏好（fetchIndustryPrefs 异常时内部返回 null，不会抛出）
  useEffect(() => {
    if (!authUser?.user_key) return;
    fetchIndustryPrefs(authUser.user_key).then((prefs) => {
      setPrefLevel1(prefs?.level1_id ? String(prefs.level1_id) : "");
      setPrefLevel2(prefs?.level2_id ? String(prefs.level2_id) : "");
      setPrefLevel3(prefs?.level3_id ? String(prefs.level3_id) : "");
    });
  }, [authUser?.user_key]);

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
      const res = await saveIndustryPrefs(authUser.user_key, {
        level1_id: Number(prefLevel1),
        level2_id: Number(prefLevel2),
        level3_id: prefLevel3 ? Number(prefLevel3) : null,
      });
      // 必须校验 res.ok：旧 dev 服务/路由缺失时 POST 返回非 2xx，不能提示假成功
      if (!res.ok) throw new Error(`SAVE_PREFS_${res.status}`);
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
      const res = await saveIndustryPrefs(authUser.user_key, { level1_id: null });
      if (!res.ok) throw new Error(`CLEAR_PREFS_${res.status}`);
      // 仅在后端确认清除后才复位本地选择，失败时保留原偏好显示
      setPrefLevel1("");
      setPrefLevel2("");
      setPrefLevel3("");
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
      <h4 className="text-sm font-extrabold text-slate-900">
        {t("authIndustryPrefLabel")}
      </h4>
      {/* 进入即说明必选规则，避免用户点保存时才发现按钮不可用 */}
      <p className="mt-1 text-xs text-slate-400">
        {t("authIndustryPrefRequiredHint")}
      </p>
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
