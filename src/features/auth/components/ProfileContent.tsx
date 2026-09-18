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
import { useEffect, useState } from "react";
import { User, LogOut, AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { useMembershipTier } from "@/shared/hooks/useMembershipTier";
import { MyRecordsPanel } from "@/features/payment";
import { IndustryPrefsForm } from "./IndustryPrefsForm";
import { PhoneBinding } from "./PhoneBinding";
import { EmailBinding } from "./EmailBinding";
import { NicknameEditor } from "./NicknameEditor";
import { AccountBenefitsCard } from "./AccountBenefitsCard";
import { useEnterpriseInfo } from "../hooks/useEnterpriseInfo";

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

export function ProfileContent() {
  const { t } = useLocale();
  const { authUser, isVip, logout, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const router = useRouter();
  const enterprise = useEnterpriseInfo();

  // 认领过期倒计时
  const [claimExpiry, setClaimExpiry] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    // 获取当前用户的认领过期时间
    if (!authUser?.id || !enterprise.bound || !enterprise.enterprise?.id) return;
    (async () => {
      try {
        const res: { data?: { expires_at?: string } } = await api("/api/supplier-claims?supplier_id=" + enterprise.enterprise!.id);
        if (res.data?.expires_at) {
          setClaimExpiry(res.data.expires_at);
        }
      } catch {
        // 忽略
      }
    })();
  }, [authUser?.id, enterprise.bound, enterprise.enterprise?.id]);

  useEffect(() => {
    if (!claimExpiry) return;
    const timer = setInterval(() => {
      const diff = new Date(claimExpiry).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("已过期");
        clearInterval(timer);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`${days}天 ${hours}小时 ${mins}分钟`);
    }, 60000);
    // 立即执行一次
    const diff = new Date(claimExpiry).getTime() - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    setCountdown(`${days}天 ${hours}小时 ${mins}分钟`);
    return () => clearInterval(timer);
  }, [claimExpiry]);

  const tierBadgeText = isVip ? tierLabel || t("authVipMember") : t("authFreeMember");
  const openNotice = (noticeId: number) => router.push(`/procurement?notice_id=${noticeId}`);

  // ★ 供应商认证状态：从企业信息页同一数据源读取，保证两页展示一致
  const verifyStatus = enterprise.enterprise
    ? String(enterprise.enterprise.verify_status || "")
    : "";
  const checkNote = enterprise.enterprise
    ? String(enterprise.enterprise.check_note || "")
    : "";
  const companyName = enterprise.enterprise
    ? String(enterprise.enterprise.name_confirmed || enterprise.enterprise.company || "")
    : "";

  if (!authUser) return null;

  return (
    <div className="space-y-7 w-full">
      {/* 认领过期倒计时横幅 */}
      {claimExpiry && countdown && countdown !== "已过期" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">企业认领待完善</span>
          <span className="text-xs text-amber-600">请在 <strong>{countdown}</strong> 内前往企业信息页完善资料并上传营业执照</span>
          <button
            type="button"
            onClick={() => router.push("/settings/enterprise")}
            className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 underline"
          >
            前往完善 →
          </button>
        </div>
      )}
      {countdown === "已过期" && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
          <Clock className="w-4 h-4 shrink-0" />
          <span>认领已过期，绑定已自动解除。如需绑定请重新认领。</span>
        </div>
      )}
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
                ) : verifyStatus === "done" ? (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="text-sm text-foreground truncate" title={companyName || undefined}>
                      {companyName || "-"}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded border border-success-200 bg-success-50 text-success-700 text-xs font-medium shrink-0">
                      {t("authEnterpriseVerifyApproved") || "已认证"}
                    </span>
                  </span>
                ) : verifyStatus === "processing" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded border border-accent-200 bg-accent-50 text-accent-700 text-xs font-medium">
                    {t("authEnterpriseVerifyProcessing") || "审核中"}
                  </span>
                ) : verifyStatus === "rejected" ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded border border-danger-200 bg-danger-50 text-danger-700 text-xs font-medium"
                    title={checkNote || undefined}
                  >
                    {t("authEnterpriseVerifyRejected") || "已驳回"}
                  </span>
                ) : (
                  <span className="text-sm text-foreground">{authUser.supplier_id ? `已绑定 #${authUser.supplier_id}` : "-"}</span>
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
          <MyRecordsPanel onOpenNotice={openNotice} />
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
