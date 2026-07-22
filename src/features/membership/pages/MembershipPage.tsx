/**
 * 会员专区页面
 * Membership Zone Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 会员专区页面入口，展示 VIP 卡片和邮件订阅
 *              Membership zone page entry, displays VIP card and email subscription
 */

import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { VipCard } from "../components/VipCard";
import { EmailSubscription } from "../components/EmailSubscription";

export default function MembershipPage() {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const userEmail = authUser?.email || "";

  const handleUpgradeClick = () => {
    if (!authUser) {
      window.dispatchEvent(new CustomEvent("supply-os:require-login"));
      return;
    }
    // 已登录但非 VIP → 触发支付
    window.dispatchEvent(new CustomEvent("supply-os:pay", {
      detail: { code: "annual_8800", name: "年度顾问服务", price: 8800, currency: "CNY" }
    }));
  };

  const handleSendEmail = (_email: string) => {
    alert(t("membershipSendEmailAlert", { email: _email }));
  };
  return (
    <div className="space-y-6">
      <VipCard
        userEmail={userEmail}
        isVip={isVip}
        onUpgradeClick={handleUpgradeClick}
      />

      <EmailSubscription initialEmail={userEmail} onSend={handleSendEmail} />
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
