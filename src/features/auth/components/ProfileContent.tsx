/**
 * 账户设置正文 — 智谱用户中心风格（全新表现层）
 * Profile Content
 *
 * @module features/auth/components/ProfileContent
 * @description 参考 bigmodel.cn 用户中心重做：基本信息卡（头像 + 内联「标签：值」
 *              三列网格）+ 安全设置行卡（实心圆图标 + 标题/灰描述 + 右侧实心按钮）
 *              + 会员权益/行业偏好/我的记录 + 注销式退出行。
 *              表现层独立于旧共享组件样式，直接用 Tailwind 原生类实现。
 */
import { useRouter } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import { User, LogOut } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { useMembershipTier } from "@/shared/hooks/useMembershipTier";
import { useClaimExpiry } from "@/shared/hooks/useClaimExpiry";
import { IndustryPrefsForm } from "./IndustryPrefsForm";
import { PhoneBinding } from "./PhoneBinding";
import { EmailBinding } from "./EmailBinding";
import { NicknameEditor } from "./NicknameEditor";
import { AccountBenefitsCard } from "./AccountBenefitsCard";
import { ClaimExpiryBanner } from "./ClaimExpiryBanner";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import {
  classifyEnterpriseBindState,
  enterpriseBindStateText,
} from "@/shared/utils/enterprise-status";

/** 基本信息内联单元：灰标签：值（同一行） */
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}：</span>
      <span className="text-sm text-foreground truncate" title={value}>
        {value || "-"}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium text-foreground mb-3">{children}</h2>;
}

export interface ProfileContentProps {
  /**
   * 「我的记录」面板组件（由 app 层从 payment 特性注入）。
   * 架构解耦（红线 #3）：auth 不再硬依赖 @/features/payment，改由上层组合。
   */
  MyRecordsPanel?: ComponentType<{ onOpenNotice: (id: number) => void }>;
}

export function ProfileContent({ MyRecordsPanel }: ProfileContentProps = {}) {
  const { t } = useLocale();
  const { authUser, isVip, logout, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const router = useRouter();
  const enterprise = useEnterpriseInfo();
  const claim = useClaimExpiry(
    authUser?.id,
    enterprise.enterprise?.id ? Number(enterprise.enterprise.id) : undefined,
    enterprise.bound,
  );

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const tierBadgeText = isVip ? tierLabel || t("authVipMember") : t("authFreeMember");
  const openNotice = (noticeId: number) => router.push(`/procurement?notice_id=${noticeId}`);

  // ★ 供应商认证状态：与企业信息页同一数据源（GET /api/user/enterprise），并走
  //   shared/utils/enterprise-status 的同一口径——后端排他闸口用的就是这份分类，
  //   否则会出现「页面说已绑定、接口却放行新认证」的两套真相。
  //   资质结论只看 verify_status（claim_status 仅 pending 参与判定：认领待核时账号侧仍是临时态）。
  //   历史上后台审核只回写归属列，曾靠「claim_status=verified 视同已认证」掩盖；
  //   该兼容已于 2026-10-08 删除（存量 14 行已对齐，今后由审核端两列一起写）。
  const bindState = classifyEnterpriseBindState(enterprise.enterprise ?? null);
  const bindText = enterpriseBindStateText(bindState);
  const checkNote = enterprise.enterprise
    ? String(enterprise.enterprise.check_note || "")
    : "";
  const companyName = enterprise.enterprise
    ? String(enterprise.enterprise.name_confirmed || enterprise.enterprise.company || "")
    : "";

  if (!authUser) return null;

  return (
    <div className="space-y-7 w-full">
      {/* 认领待完善倒计时横幅（与企业信息页同一组件与文案） */}
      <ClaimExpiryBanner
        remaining={claim.remaining}
        expired={claim.expired}
        withCta
        onCta={() => router.push("/settings/enterprise")}
      />
      {/* ── 基本信息 ── */}
      <section>
        <SectionTitle>{t("settingsBasicInfo") || "基本信息"}</SectionTitle>
        <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-500 flex items-center justify-center shrink-0">
              <User className="w-8 h-8" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-3 flex-1">
              <InfoItem label={t("authNicknameTitle") || "用户名称"} value={authUser.nickname || "-"} />
              <InfoItem label={t("authEmailTitle") || "联系邮箱"} value={authUser.email || "-"} />
              <InfoItem label={t("authAccountType") || "账户属性"} value={tierBadgeText} />
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-xs text-muted-foreground shrink-0">{t("authSupplierStatus") || "供应商状态"}：</span>
                {enterprise.loading ? (
                  <span className="inline-block w-16 h-4 rounded bg-secondary-200 animate-pulse" />
                ) : !enterprise.bound ? (
                  <span className="text-sm text-muted-foreground">{t("authSupplierPending") || "未绑定"}</span>
                ) : bindState === "pending" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded border border-accent-200 bg-accent-50 text-accent-700 text-xs font-medium">
                    {t(bindText.key) || bindText.fallback}
                  </span>
                ) : bindState === "rejected" ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded border border-danger-200 bg-danger-50 text-danger-700 text-xs font-medium"
                    title={checkNote || undefined}
                  >
                    {t(bindText.key) || bindText.fallback}
                  </span>
                ) : bindState === "verified" ? (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="text-sm text-foreground truncate" title={companyName || undefined}>
                      {companyName || "-"}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded border border-success-200 bg-success-50 text-success-700 text-xs font-medium shrink-0">
                      {t(bindText.key) || bindText.fallback}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-foreground">{t(bindText.key) || bindText.fallback}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 安全设置（行卡） ── */}
      <section>
        <SectionTitle>{t("settingsAccountSecurity") || "安全设置"}</SectionTitle>
        <div className="bg-secondary-50 border border-border rounded-lg divide-y divide-border/70">
          <NicknameEditor />
          <PhoneBinding />
          <EmailBinding />
        </div>
      </section>

      {/* ── 会员权益 ── */}
      <section>
        <SectionTitle>{t("settingsMembership") || "会员权益"}</SectionTitle>
        <AccountBenefitsCard />
      </section>

      {/* ── 默认行业偏好 ── */}
      <section>
        <SectionTitle>{t("authIndustryPrefLabel") || "默认行业偏好"}</SectionTitle>
        <IndustryPrefsForm />
      </section>

      {/* ── 我的记录 ── */}
      <section>
        <SectionTitle>{t("settingsMyRecords") || "我的记录"}</SectionTitle>
        <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5">
          {MyRecordsPanel ? <MyRecordsPanel onOpenNotice={openNotice} /> : null}
        </div>
      </section>

      {/* ── 退出登录（注销式行） ── */}
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-4 flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
          <LogOut className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authLogout") || "退出登录"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("settingsLogoutDesc") || "退出当前账号的登录状态"}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="px-4 py-1.5 rounded-md bg-danger-600 text-white text-xs font-medium hover:bg-danger-700 transition-colors shrink-0"
        >
          {t("authLogout") || "退出"}
        </button>
      </div>
    </div>
  );
}

ProfileContent.displayName = "ProfileContent";
