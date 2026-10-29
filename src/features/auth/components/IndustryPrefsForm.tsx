/**
 * 账号默认行业偏好表单
 * Account Industry Preference Form
 *
 * @module features/auth/components/IndustryPrefsForm
 * @description 已登录面板的默认行业管理卡片：品目三级级联（经
 *              useCommodityPrefCascade），进入回填已保存偏好，保存/清除成功后
 *              广播 supply-os:industry-prefs-updated 供公采页重新探测。
 *              主营业务智能推断采用"候选确认"交互：候选列表由用户点选回填，
 *              杜绝低置信推断静默锁定错误分支。
 *              保存键为 UGT 最深已选节点码（commodity_code），旧行的字典 id 随
 *              旧品类字典退役停用。
 */
import { useEffect, useState } from "react";
import { useUserId } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import {
  fetchIndustryPrefs, saveIndustryPrefs, fetchSmartInferCommodity,
  type CommodityInferCandidate,
} from "@/core/api/industry-prefs";
import { useCommodityPrefCascade } from "../hooks/useCommodityPrefCascade";
import { CommodityPrefSelects } from "./CommodityPrefSelects";
import { CommodityInferCandidates } from "./CommodityInferCandidates";
import { Button, Input } from "@/shared/ui";

export interface IndustryPrefsFormProps {}

/** 我的默认行业（本地差异 #5 配套 UI），内部经 useAuth 取 userKey，不接受 props 透传用户 */
export function IndustryPrefsForm() {
  const { t } = useLocale();
  const userId = useUserId();
  const {
    groupOptions,
    subOptions,
    subOptions2,
    prefGroup,
    prefLevel2,
    prefLevel3,
    setPrefLevel3,
    handleGroupChange,
    handleLevel2Change,
    applyInferredCode,
    resetCascade,
  } = useCommodityPrefCascade();

  // 主营业务智能推断状态（按用户隔离 localStorage key）
  const mbKey = userId ? `supply-os:main-business:${userId}` : "";
  const [mainBusiness, setMainBusinessRaw] = useState(
    () => (mbKey ? localStorage.getItem(mbKey) || "" : ""),
  );
  const setMainBusiness = (v: string) => {
    setMainBusinessRaw(v);
    if (mbKey) localStorage.setItem(mbKey, v);
  };
  // 候选列表：匹配分降序；由用户点选确认回填，不做静默自动回填
  const [inferCandidates, setInferCandidates] = useState<CommodityInferCandidate[]>([]);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [inferLoading, setInferLoading] = useState(false);
  const [inferSearched, setInferSearched] = useState(false);

  const [prefMessage, setPrefMessage] = useState("");
  const [prefMessageIsError, setPrefMessageIsError] = useState(false);

  // 切换账号时：先重置全部状态，再回填新用户偏好
  useEffect(() => {
    // 重置级联选择器、推断状态、主营业务关键词
    resetCascade();
    setMainBusinessRaw("");
    setInferCandidates([]);
    setAppliedCode(null);
    setInferSearched(false);
    setPrefMessage("");

    const uid = userId;
    if (!uid) return;

    // 回填当前用户的 localStorage 关键词
    const savedMb = localStorage.getItem(`supply-os:main-business:${uid}`);
    if (savedMb) setMainBusinessRaw(savedMb);

    // 从后端加载已保存的行业偏好（码版：commodity_code；所属大类由码前缀推导）
    fetchIndustryPrefs().then((prefs) => {
      if (prefs?.commodityCode) {
        applyInferredCode(prefs.commodityCode);
      }
    });
  }, [userId, resetCascade, applyInferredCode]);

  // 防抖推断（300ms）：用户输入主营业务关键词后匹配品目树节点候选
  useEffect(() => {
    if (mainBusiness.trim().length < 1) {
      setInferCandidates([]);
      setAppliedCode(null);
      setInferSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setInferLoading(true);
      setInferSearched(false);
      try {
        const data = await fetchSmartInferCommodity(mainBusiness.trim());
        const candidates = data?.candidates || [];
        setInferCandidates(candidates);
        // 不自动回填：仅展示候选列表，由用户点选确认，防止推断覆盖手动选择
        setAppliedCode(null);
        setInferSearched(true);
      } catch {
        // 推断失败不影响保存流程
      } finally {
        setInferLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mainBusiness]);

  // 用户从候选中点选：以该候选节点码回填级联（仅回填可见三级），L4/L5 不参与
  const pickCandidate = (candidate: CommodityInferCandidate) => {
    applyInferredCode(candidate.code);
    setAppliedCode(candidate.code);
    setPrefMessage("");
  };

  const handleGroup = (value: string) => {
    handleGroupChange(value);
    setAppliedCode(null); // 手动改选：清除推断高亮
    setPrefMessage("");
  };

  const handleLevel2 = (value: string) => {
    handleLevel2Change(value);
    setAppliedCode(null);
    setPrefMessage("");
  };

  const handleLevel3 = (value: string) => {
    setPrefLevel3(value);
    setPrefMessage("");
  };

  /** 已登录面板：保存当前选择为账号默认行业（前两级必选） */
  const savePrefs = async () => {
    if (!userId || !prefGroup || !prefLevel2) return;
    try {
      // 仅持久化用户在 UI 中确认过的最深三级码；L4/L5 是推断产物，
      // 静默保存会在推断出错时把匹配锁定到错误分支（最高分档）
      await saveIndustryPrefs({ commodity_code: prefLevel3 || prefLevel2 });
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

  /** 已登录面板：清除账号默认行业（空码即删除） */
  const clearPrefs = async () => {
    if (!userId) return;
    try {
      await saveIndustryPrefs({ commodity_code: null });
      // 仅在后端确认清除后才复位本地选择，失败时保留原偏好显示
      resetCascade();
      setMainBusiness("");
      setInferCandidates([]);
      setAppliedCode(null);
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

  // 推断反馈文案：已应用候选 → 确认可改；未应用 → 引导手动点选
  const inferHint = appliedCode
    ? `${t("authMainBusinessInferred")}，${t("authMainBusinessCandidateChange")}`
    : t("authMainBusinessCandidatePick");

  return (
    /* 我的默认行业 — 公采页进入时按此偏好默认筛选（本地差异 #5 配套 UI） */
    <div className="bg-secondary-50 border border-border rounded-xl p-5">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-medium text-foreground">
          {t("authIndustryPrefLabel")}
        </h4>
        <p className="text-2xs text-muted-foreground">
          {t("authIndustryPrefRequiredHint")}
        </p>
      </div>
      {/* 主营业务智能推断 + 候选确认 + 三级分类选择 */}
      <div className="mt-3">
        <Input
          type="text"
          value={mainBusiness}
          onChange={(e) => setMainBusiness(e.target.value)}
          placeholder={t("authMainBusinessPlaceholder")}
          className="bg-white"
        />
        {inferLoading && (
          <p className="mt-1 text-2xs text-muted-foreground">{t("authMainBusinessMatching") || "匹配中..."}</p>
        )}
        {!inferLoading && inferCandidates.length > 0 && (
          <CommodityInferCandidates
            candidates={inferCandidates}
            appliedCode={appliedCode}
            hint={inferHint}
            onPick={pickCandidate}
          />
        )}
        {!inferLoading && inferCandidates.length === 0 && inferSearched && (
          <p className="mt-1 text-2xs text-accent-600">
            {t("authMainBusinessNoMatch")}
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CommodityPrefSelects
          groupOptions={groupOptions}
          subOptions={subOptions}
          subOptions2={subOptions2}
          prefGroup={prefGroup}
          prefLevel2={prefLevel2}
          prefLevel3={prefLevel3}
          onGroupChange={handleGroup}
          onLevel2Change={handleLevel2}
          onLevel3Change={handleLevel3}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={savePrefs}
          disabled={!prefGroup || !prefLevel2}
          className="py-2 text-xs font-black shadow-xs disabled:hover:bg-teal-600"
        >
          {t("authIndustryPrefSave")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearPrefs}
          className="px-4 py-2 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
        >
          {t("authIndustryPrefClear")}
        </Button>
        {/* 未选满前两级时按钮旁给出引导，选满后自动消失 */}
        {(!prefGroup || !prefLevel2) && (
          <p className="text-xs font-medium text-accent-600">
            {t("authIndustryPrefSaveHint")}
          </p>
        )}
      </div>
      {prefMessage && (
        <p
          className={`mt-3 text-xs font-medium ${
            prefMessageIsError ? "text-danger-600" : "text-success-600"
          }`}
        >
          {prefMessage}
        </p>
      )}
    </div>
  );
}
