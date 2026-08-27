/**
 * 注册表单
 * Register Form
 *
 * @module features/auth/components/forms/RegisterForm
 */
import { useState, useEffect } from "react";
import { Input, Select, Button } from "@/shared/ui";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/passwordPolicy";
import { useLocale } from "@/core/i18n";
import type { UseUnspscPrefCascadeReturn } from "../../hooks/useUnspscPrefCascade";
import { UnspscPrefSelects } from "../UnspscPrefSelects";
import { UnspscInferCandidates } from "../UnspscInferCandidates";
import { fetchSmartInferUnspsc, type SmartInferCandidate } from "@/core/unspsc";
import type { AuthFormState, ClaimFormState } from "../../hooks/useAuthForm";
import type { useRegisterCode } from "../../hooks/useRegisterCode";

export interface RegisterFormProps {
  authForm: AuthFormState;
  setAuthForm: React.Dispatch<React.SetStateAction<AuthFormState>>;
  claimForm: ClaimFormState;
  setClaimForm: React.Dispatch<React.SetStateAction<ClaimFormState>>;
  authError: string;
  registerCode: ReturnType<typeof useRegisterCode>;
  cascade: UseUnspscPrefCascadeReturn;
}

export function RegisterForm({
  authForm,
  setAuthForm,
  claimForm,
  setClaimForm,
  authError,
  registerCode,
  cascade,
}: RegisterFormProps) {
  const { t } = useLocale();

  // 主营行业偏好 — 由父组件 LoginRegisterForm 通过 cascade prop 注入
  const {
    industryOptions,
    subOptions,
    subOptions2,
    prefLevel1,
    prefLevel2,
    prefLevel3,
    setPrefLevel3,
    handlePrefLevel1Change,
    handlePrefLevel2Change,
    applyInferredPath,
  } = cascade;

  // 主营业务智能推断（候选确认式：高置信自动回填，其余由用户点选）
  const [mainBusiness, setMainBusiness] = useState("");
  const [inferCandidates, setInferCandidates] = useState<SmartInferCandidate[]>([]);
  const [autoAppliedNodeId, setAutoAppliedNodeId] = useState<number | null>(null);
  const [inferLoading, setInferLoading] = useState(false);
  const [inferSearched, setInferSearched] = useState(false);

  // 防抖推断
  useEffect(() => {
    if (mainBusiness.trim().length < 1) {
      setInferCandidates([]);
      setAutoAppliedNodeId(null);
      setInferSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setInferLoading(true);
      setInferSearched(false);
      try {
        const data = await fetchSmartInferUnspsc(mainBusiness.trim());
        const candidates = data?.candidates || [];
        setInferCandidates(candidates);
        // 不再自动回填：仅展示候选列表，由用户点选确认，防止推断覆盖手动选择
        setAutoAppliedNodeId(null);
        setInferSearched(true);
      } catch {
        // 推断失败不影响注册流程
      } finally {
        setInferLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mainBusiness]);

  // 用户从候选中点选：以该候选路径回填级联（L1~L3），L4/L5 不参与
  const pickCandidate = (candidate: SmartInferCandidate) => {
    applyInferredPath(candidate);
    setAutoAppliedNodeId(candidate.node_id);
  };

  // 推断反馈文案：自动应用 → 确认可改；未自动应用 → 引导手动点选
  const inferHint = autoAppliedNodeId
    ? `${t("authMainBusinessInferred")}，${t("authMainBusinessCandidateChange")}`
    : t("authMainBusinessCandidatePick");

  return (
    <div className="space-y-3">
      {/* 供应商绑定信息 */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-slate-900">
            {t("authCompanyClaimInfo")}
          </h4>
          <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">
            {t("authPendingReview")}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            type="text"
            value={authForm.displayName}
            onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })}
            placeholder={t("authContactNamePlaceholder")}
            className="bg-white"
          />
          <Select
            value={claimForm.supplierType}
            onChange={(e) => setClaimForm({ ...claimForm, supplierType: e.target.value })}
            className="bg-white"
          >
            <option value="domestic">{t("authSupplierDomestic")}</option>
            <option value="international">{t("authSupplierInternational")}</option>
          </Select>
          <Input
            type="text"
            value={claimForm.companyName}
            onChange={(e) => setClaimForm({ ...claimForm, companyName: e.target.value })}
            placeholder={t("authCompanyPlaceholder")}
            className="sm:col-span-2 bg-white"
          />
          <Input
            type="text"
            value={claimForm.contactPhone}
            onChange={(e) => setClaimForm({ ...claimForm, contactPhone: e.target.value })}
            placeholder={t("authPhonePlaceholder")}
            className="bg-white"
          />
          <Input
            type="text"
            value={claimForm.businessLicenseNo}
            onChange={(e) => setClaimForm({ ...claimForm, businessLicenseNo: e.target.value })}
            placeholder={t("authLicensePlaceholder")}
            className="bg-white"
          />
        </div>
        {/* 主营行业 */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-black text-slate-500">
              {t("authIndustryPrefLabel")}
            </p>
            <p className="text-[11px] text-slate-400">
              {t("authIndustryPrefRequiredHint")}
            </p>
          </div>
          <Input
            type="text"
            value={mainBusiness}
            onChange={(e) => setMainBusiness(e.target.value)}
            placeholder={t("authMainBusinessPlaceholder")}
            className="mt-2 bg-white"
          />
          {inferLoading && (
            <p className="mt-1 text-[11px] text-slate-400">{t("authMainBusinessMatching") || "匹配中..."}</p>
          )}
          {!inferLoading && inferCandidates.length > 0 && (
            <UnspscInferCandidates
              candidates={inferCandidates}
              appliedNodeId={autoAppliedNodeId}
              hint={inferHint}
              onPick={pickCandidate}
            />
          )}
          {!inferLoading && inferCandidates.length === 0 && inferSearched && (
            <p className="mt-1 text-[11px] text-amber-600">
              {t("authMainBusinessNoMatch")}
            </p>
          )}
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UnspscPrefSelects
              industryOptions={industryOptions}
              subOptions={subOptions}
              subOptions2={subOptions2}
              prefLevel1={prefLevel1}
              prefLevel2={prefLevel2}
              prefLevel3={prefLevel3}
              onLevel1Change={handlePrefLevel1Change}
              onLevel2Change={handlePrefLevel2Change}
              onLevel3Change={setPrefLevel3}
            />
          </div>
        </div>
      </div>

      {/* 邮箱 + 验证码 + 密码 */}
      <Input
        type="email"
        inputMode="email"
        value={authForm.email}
        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
        placeholder={t("authEmailPlaceholder")}
        autoComplete="email"
      />
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            type="text"
            value={registerCode.registerVerifyCode}
            onChange={(e) => registerCode.setRegisterVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("authRegisterCodePlaceholder") || "邮箱验证码"}
            maxLength={6}
            className="flex-1 tracking-widest"
          />
          <button
            type="button"
            onClick={() => registerCode.handleSendRegisterCode(authForm.email.trim())}
            disabled={registerCode.registerCodeLoading || registerCode.registerCodeCountdown > 0}
            className="shrink-0 px-3 py-2 text-xs font-bold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {registerCode.registerCodeCountdown > 0
              ? `${registerCode.registerCodeCountdown}s`
              : registerCode.registerCodeLoading
                ? t("authForgotSending")
                : t("authRegisterSendCode") || "获取验证码"}
          </button>
        </div>
        {registerCode.registerCodeError && (
          <p className="text-xs font-bold text-rose-600">{registerCode.registerCodeError}</p>
        )}
        {registerCode.registerCodeSent && registerCode.registerCodeCountdown <= 0 && (
          <p className="text-xs text-teal-600">{t("authRegisterCodeSent") || "验证码已发送，请查收邮箱"}</p>
        )}
      </div>
      <Input
        type="password"
        value={authForm.password}
        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
        placeholder={t("authPasswordPlaceholder")}
        minLength={PASSWORD_MIN_LENGTH}
      />

      {authError && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {authError}
        </p>
      )}
      <Button
        type="submit"
        variant="dark"
        className="w-full py-3 rounded-xl text-sm font-black"
      >
        {t("authRegisterSubmit")}
      </Button>
    </div>
  );
}
