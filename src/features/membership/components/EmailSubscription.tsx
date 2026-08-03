/**
 * 邮件订阅组件
 * Email Subscription Component
 *
 * @module features/membership/components/EmailSubscription
 * @description 会员邮件订阅交互区
 *              Member email subscription interaction area
 */

import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { Input } from "@/shared/ui";

export interface EmailSubscriptionProps {
  initialEmail: string;
  onSend: (email: string) => void;
}

export function EmailSubscription({ initialEmail, onSend }: EmailSubscriptionProps) {
  const { t } = useLocale();
  const [email, setEmail] = useState(initialEmail);

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs">
      <h4 className="text-base font-extrabold text-slate-800">
        {t("membershipQuestionTitle")}
      </h4>
      <p className="text-xs text-slate-500">{t("membershipQuestionDesc")}</p>

      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="flex-1 py-2 text-xs"
        />
        <button
          onClick={() => onSend(email)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {t("membershipSendFree")}
        </button>
      </div>
    </div>
  );
}

EmailSubscription.displayName = "EmailSubscription";
