/**
 * 账户设置正文（设置中心 /settings/profile 承载）
 * Profile Content
 *
 * @module features/auth/components/ProfileContent
 * @description 原账号弹窗（AccountPanel）已登录态正文的页面化版本：账号信息卡
 *              （VIP 状态 / 供应商认证 / 权益卡）+ 昵称编辑 + 手机/邮箱绑定 +
 *              行业偏好 + 我的记录 + 退出登录。与弹窗解耦：不再接收 onClose，
 *              打开关联公告直接路由跳转。
 *              Page-oriented body of the retired account modal: account info card,
 *              nickname/phone/email binding, industry prefs, records and logout.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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

export function ProfileContent() {
  const { t } = useLocale();
  const { authUser, isVip, logout, claimMessage, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const router = useRouter();

  // 进入页面时刷新认证快照：徽章 isVip 源自登录时缓存的 membership_tier，
  // 若用户在本次会话内升级为 VIP，缓存仍为 free 会导致徽章误显"免费会员"。
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // VIP 徽章文案：按已解锁套餐显示等级（如"基础版"），兜底"VIP 会员"/"免费会员"
  const tierBadgeText = isVip
    ? tierLabel || t("authVipMember")
    : t("authFreeMember");

  // 打开关联公告：页面态直接跳转（无需关弹窗）
  const openNotice = (noticeId: number) => {
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

ProfileContent.displayName = "ProfileContent";
