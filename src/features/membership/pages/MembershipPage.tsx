/**
 * 会员专区页面
 * Membership Zone Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 会员专区页面入口，展示 VIP 卡片和邮件订阅
 *              Membership zone page entry, displays VIP card and email subscription
 */

import { VipCard } from "../components/VipCard";
import { EmailSubscription } from "../components/EmailSubscription";

export interface MembershipPageProps {
  userEmail: string;
  isVip: boolean;
  onUpgradeClick: () => void;
  onSendEmail: (email: string) => void;
}

export default function MembershipPage({
  userEmail,
  isVip,
  onUpgradeClick,
  onSendEmail,
}: MembershipPageProps) {
  return (
    <div className="space-y-6">
      <VipCard
        userEmail={userEmail}
        isVip={isVip}
        onUpgradeClick={onUpgradeClick}
      />

      <EmailSubscription initialEmail={userEmail} onSend={onSendEmail} />
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
