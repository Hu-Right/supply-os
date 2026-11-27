/**
 * 支付前协议勾选（P0 合规）
 * Pre-payment agreement consent
 *
 * @module shared/components/payment-modal/agreement
 * @description 购买前必须由用户**主动勾选**《用户服务协议》《付费会员及退款规则》《隐私政策》，
 *              默认不勾选（不得由代码预置为 true）。勾选状态由容器 PaymentModalCore 持有，
 *              未勾选时确认支付按钮禁用，见 ChooseStep。
 *
 *              三种协议均以新标签页打开：用户可先阅读再回来勾选，
 *              链接点击不触发 label 的勾选切换（stopPropagation）。
 */
import Link from "next/link";
import { useLocale } from "@/core/i18n";

export interface PaymentAgreementProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** 协议链接（口径与 /terms、/refund-policy、/privacy 三个法律页一致） */
const DOC_LINKS = [
  { key: "paymentAgreementTerms", href: "/terms" },
  { key: "paymentAgreementRefund", href: "/refund-policy" },
  { key: "paymentAgreementPrivacy", href: "/privacy" },
] as const;

export function PaymentAgreement({ checked, onChange }: PaymentAgreementProps) {
  const { t } = useLocale();

  return (
    <label className="flex cursor-pointer select-none items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-teal-600"
      />
      <span>
        {t("paymentAgreementPrefix")}
        {DOC_LINKS.map((doc, i) => (
          <span key={doc.href}>
            {i > 0 &&
              (i === DOC_LINKS.length - 1
                ? t("paymentAgreementConjunction")
                : t("paymentAgreementSeparator"))}
            <Link
              href={doc.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800"
            >
              {t(doc.key)}
            </Link>
          </span>
        ))}
      </span>
    </label>
  );
}

PaymentAgreement.displayName = "PaymentAgreement";
