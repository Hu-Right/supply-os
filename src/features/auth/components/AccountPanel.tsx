/**
 * 账号面板
 * Account Panel
 *
 * @module features/auth/components/AccountPanel
 * @description 账号弹窗已登录态面板：账号信息卡（VIP 状态 / 供应商认证 /
 *              线索配额）+ 手机号绑定管理 + 默认行业偏好管理（IndustryPrefsForm）+
 *              MyRecordsPanel + 退出登录。
 *              Logged-in panel of the auth modal: account info card, phone binding,
 *              industry preference form, records panel and logout.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useMembershipTier } from "@/features/membership";
import { MyRecordsPanel } from "@/features/payment";
import { IndustryPrefsForm } from "./IndustryPrefsForm";
import { PhoneBinding } from "./PhoneBinding";
import { EmailBinding } from "./EmailBinding";
import { NicknameEditor } from "./NicknameEditor";
import { AccountBenefitsCard } from "./AccountBenefitsCard";

export interface AccountPanelProps {
  onClose: () => void;
}

export function AccountPanel({ onClose }: AccountPanelProps) {
  const { t } = useLocale();
  const { authUser, isVip, logout, claimMessage, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const router = useRouter();

  // 打开面板时刷新认证快照：徽章 isVip 源自登录时缓存的 membership_tier，
  // 若用户在本次会话内升级为 VIP，缓存仍为 free 会导致徽章误显"免费会员"。
  // 权益卡走新鲜 /api/membership/status，此处对齐刷新上下文消除两者不一致。
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // VIP 徽章文案：按已解锁套餐显示等级（如"基础版"），兜底"VIP 会员"/"免费会员"
  const tierBadgeText = isVip
    ? tierLabel || t("authVipMember")
    : t("authFreeMember");

  // 打开关联公告：先关闭账户弹窗再跳转到公采页
  const openNotice = (noticeId: number) => {
    onClose();
    router.push(`/procurement?notice_id=${noticeId}`);
  };

  if (!authUser) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-500 uppercase">
              {t("authCurrentAccount")}
            </p>
            <h4 className="text-lg font-extrabold text-slate-900 mt-1">
              {authUser.nickname || authUser.email}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {authUser.email}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-black ${
              isVip
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {tierBadgeText}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="font-black text-slate-400">{t("authSupplierStatus")}</p>
            <p className="font-bold text-slate-800 mt-1">
              {authUser.supplier_id
                ? t("authSupplierVerified", { id: authUser.supplier_id })
                : t("authSupplierPending")}
            </p>
          </div>
          {/* 权益卡片：根据用户最佳权益类型动态展示 */}
          <AccountBenefitsCard />
        </div>
      </div>
      <NicknameEditor />
      <PhoneBinding />
      <EmailBinding />
      <IndustryPrefsForm />
      <MyRecordsPanel onOpenNotice={openNotice} />
      {claimMessage && (
        <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
          {claimMessage}
        </p>
      )}
      <Button
        onClick={logout}
        variant="outline"
        className="w-full text-slate-600"
      >
        {t("authLogout")}
      </Button>
    </div>
  );
}
