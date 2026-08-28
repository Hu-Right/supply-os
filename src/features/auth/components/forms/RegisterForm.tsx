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
import EnterpriseQualificationForm from "../EnterpriseQualificationForm";

/** 检测浏览器是否存在 ref_code Cookie（推荐链接自动带入） */
function detectRefCookie(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)ref_code=/.test(document.cookie);
}

export interface RegisterFormProps {
  authForm: AuthFormState;
  setAuthForm: React.Dispatch<React.SetStateAction<AuthFormState>>;
  claimForm: ClaimFormState;
  setClaimForm: React.Dispatch<React.SetStateAction<ClaimFormState>>;
  authError: string;
  registerCode: ReturnType<typeof useRegisterCode>;
  cascade: UseUnspscPrefCascadeReturn;
  onQualificationChange?: (data: Record<string, string | string[]>) => void;
}

export function RegisterForm({
  authForm,
  setAuthForm,
  claimForm,
  setClaimForm,
  authError,
  registerCode,
  cascade,
  onQualificationChange,
}: RegisterFormProps) {
  const { t } = useLocale();

  // 检测推荐链接 Cookie，用于显示自动填入提示
  const [hasRefCookie] = useState(detectRefCookie);

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
      {/* 注册类型选择 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setAuthForm({ ...authForm, userType: "personal" })}
          className={`rounded-xl border-2 p-3 text-center transition-all ${
            authForm.userType === "personal"
              ? "border-teal-500 bg-teal-50"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="text-lg font-bold">👤</div>
          <div className={`text-sm font-bold ${authForm.userType === "personal" ? "text-teal-700" : "text-slate-600"}`}>
            {t("authRegisterTypePersonal") || "个人注册"}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{t("authRegisterTypePersonalDesc") || "外贸从业者"}</div>
        </button>
        <button
          type="button"
          onClick={() => setAuthForm({ ...authForm, userType: "enterprise" })}
          className={`rounded-xl border-2 p-3 text-center transition-all ${
            authForm.userType === "enterprise"
              ? "border-blue-500 bg-blue-50"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="text-lg font-bold">🏢</div>
          <div className={`text-sm font-bold ${authForm.userType === "enterprise" ? "text-blue-700" : "text-slate-600"}`}>
            {t("authRegisterTypeEnterprise") || "企业注册"}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{t("authRegisterTypeEnterpriseDesc") || "供应商入驻"}</div>
        </button>
      </div>

      {/* 企业诊断表单（仅企业注册显示，纯信息收集） */}
      {authForm.userType === "enterprise" && (
        <EnterpriseQualificationForm onFormChange={(data) => onQualificationChange?.(data as unknown as Record<string, string | string[]>)} />
      )}

      {/* 手机号 */}
      <div className="space-y-1">
        <Input
          type="tel"
          inputMode="tel"
          value={authForm.phone}
          onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          placeholder={t("authPhonePlaceholder") || "请输入手机号"}
          autoComplete="tel"
        />
      </div>
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            type="text"
            value={registerCode.registerVerifyCode}
            onChange={(e) => registerCode.setRegisterVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("authSmsCodePlaceholder") || "短信验证码"}
            maxLength={6}
            className="flex-1 tracking-widest"
          />
          <button
            type="button"
            onClick={() => registerCode.handleSendSmsCode(authForm.phone.trim())}
            disabled={registerCode.registerCodeLoading || registerCode.registerCodeCountdown > 0}
            className="shrink-0 px-3 py-2 text-xs font-bold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {registerCode.registerCodeCountdown > 0
              ? `${registerCode.registerCodeCountdown}s`
              : registerCode.registerCodeLoading
                ? t("authForgotSending")
                : t("authRegisterSendSmsCode") || "获取验证码"}
          </button>
        </div>
        {registerCode.registerCodeError && (
          <p className="text-xs font-bold text-rose-600">{registerCode.registerCodeError}</p>
        )}
        {registerCode.registerCodeSent && registerCode.registerCodeCountdown <= 0 && (
          <p className="text-xs text-teal-600">{t("authSmsCodeSent") || "验证码已发送，请查收短信"}</p>
        )}
      </div>

      {/* 邮箱已从注册流程移除，用户可在个人中心独立绑定 */}
      <Input
        type="password"
        value={authForm.password}
        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
        placeholder={t("authPasswordPlaceholder")}
        minLength={PASSWORD_MIN_LENGTH}
      />

      {/* 邀请码（必填） */}
      <div>
        <Input
          type="text"
          value={authForm.invitationCode}
          onChange={(e) => setAuthForm({ ...authForm, invitationCode: e.target.value.toUpperCase() })}
          placeholder={t("authInvitationCodePlaceholder") || "请输入邀请码"}
          className="uppercase tracking-wider"
        />
        {authForm.invitationCode && hasRefCookie && (
          <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
            <span>✓</span> {t("authInvitationCodeAutoFilled") || "邀请码已由推荐链接自动填入"}
          </p>
        )}
      </div>

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
