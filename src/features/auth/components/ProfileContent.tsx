/**
 * 账户设置正文（设置中心 /settings/profile 承载）— 极简智谱风格
 * Profile Content
 *
 * @module features/auth/components/ProfileContent
 * @description 极简账户中心：基本信息卡（头像 + label:value 网格）+
 *              账号与安全行式列表（昵称/手机/邮箱，行内展开编辑）+
 *              会员权益 / 默认行业偏好 / 我的记录 扁平分区 + 退出登录。
 *              中性底 + 单一强调色 + 细描边细分割线，无渐变重阴影。
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { User } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useMembershipTier } from "@/shared/hooks/useMembershipTier";
import { MyRecordsPanel } from "@/features/payment";
import { IndustryPrefsForm } from "./IndustryPrefsForm";
import { PhoneBinding } from "./PhoneBinding";
import { EmailBinding } from "./EmailBinding";
import { NicknameEditor } from "./NicknameEditor";
import { AccountBenefitsCard } from "./AccountBenefitsCard";

/** 基本信息网格单元：灰小标签 + 正文值 */
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-1 truncate" title={value}>
        {value || "-"}
      </p>
    </div>
  );
}

/** 分区标题 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-medium text-foreground mb-3">{children}</h2>
  );
}

export function ProfileContent() {
  const { t } = useLocale();
  const { authUser, isVip, logout, claimMessage, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const router = useRouter();

  // 进入页面时刷新认证快照，避免会话内升级后徽章误显
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const tierBadgeText = isVip
    ? tierLabel || t("authVipMember")
    : t("authFreeMember");

  const openNotice = (noticeId: number) => {
    router.push(`/procurement?notice_id=${noticeId}`);
  };

  if (!authUser) return null;

  return (
    <div className="space-y-7 max-w-3xl">
      {/* ── 基本信息 ── */}
      <section>
        <SectionTitle>{t("settingsBasicInfo") || "基本信息"}</SectionTitle>
        <div className="bg-secondary-50 border border-border rounded-xl p-5">
          <div className="flex flex-col sm:flex-row gap-5">
            {/* 头像 */}
            <div className="w-16 h-16 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
              <User className="w-7 h-7" />
            </div>
            {/* label:value 网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 flex-1">
              <InfoItem label={t("authNicknameTitle") || "用户名称"} value={authUser.nickname || "-"} />
              <InfoItem label={t("authEmailTitle") || "联系邮箱"} value={authUser.email || "-"} />
              <InfoItem label={t("authAccountType") || "账户属性"} value={tierBadgeText} />
              <InfoItem
                label={t("authSupplierStatus") || "供应商状态"}
                value={
                  authUser.supplier_id
                    ? t("authSupplierVerified", { id: authUser.supplier_id })
                    : t("authSupplierPending")
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 账号与安全（行式列表） ── */}
      <section>
        <SectionTitle>{t("settingsAccountSecurity") || "账号与安全"}</SectionTitle>
        <div className="bg-secondary-50 border border-border rounded-xl divide-y divide-border">
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
        <div className="bg-secondary-50 border border-border rounded-xl p-5">
          <MyRecordsPanel onOpenNotice={openNotice} />
        </div>
      </section>

      {/* ── 退出登录 ── */}
      <div className="pt-1">
        <Button
          onClick={logout}
          variant="outline"
          className="text-danger-600 border-border hover:bg-danger-50 hover:border-danger-200"
        >
          {t("authLogout")}
        </Button>
      </div>

      {claimMessage && (
        <p className="text-xs font-medium text-success-700 bg-success-50 border border-success-200 rounded-lg p-3">
          {claimMessage}
        </p>
      )}
    </div>
  );
}

ProfileContent.displayName = "ProfileContent";
