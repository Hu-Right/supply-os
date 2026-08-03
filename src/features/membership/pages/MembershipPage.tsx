/**
 * 会员专区页面
 * Membership Zone Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 会员专区页面入口，展示 VIP 卡片和邮件订阅
 *              Membership zone page entry, displays VIP card and email subscription
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { VipCard } from "../components/VipCard";
import { EmailSubscription } from "../components/EmailSubscription";
import { fetchPlans } from "../api";
import { emitAppEvent } from "@/core/events";

/** 会员升级套餐编码（对应 crm_membership_plans） */
const UPGRADE_PLAN_CODE = "annual_8800";
/** 兜底套餐：API 不可用时用于即时展示，避免升级按钮无价可显 */
const FALLBACK_PLAN = { code: UPGRADE_PLAN_CODE, name: "年度顾问服务", price: 8800, currency: "CNY" };

export default function MembershipPage() {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const userEmail = authUser?.email || "";

  // 套餐价格以数据库为准（对齐远端 buyPlan）：先用兜底价，异步拉 /api/membership/plans 校准。
  const [payPlan, setPayPlan] = useState(FALLBACK_PLAN);
  useEffect(() => {
    let alive = true;
    fetchPlans()
      .then((plans) => {
        const plan = plans.find((p) => p.plan_code === UPGRADE_PLAN_CODE);
        if (alive && plan && Number(plan.price) > 0) {
          setPayPlan({
            code: plan.plan_code,
            name: plan.name || FALLBACK_PLAN.name,
            price: Number(plan.price),
            currency: plan.currency || "CNY",
          });
        }
      })
      .catch(() => {
        // 拉取失败保留兜底价，不阻断升级流程
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleUpgradeClick = () => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    // 已登录但非 VIP → 触发支付（价格以数据库校准结果为准）
    emitAppEvent("supply-os:pay", payPlan);
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
