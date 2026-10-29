/**
 * 会员支付弹窗（统一核心的会员侧薄封装）
 * Membership Payment Modal (thin wrapper over the unified core)
 *
 * @module features/payment/components/PaymentModal
 * @description 支付流程统一收敛至 PaymentModalCore（零跳转弹窗支付）：
 *              本组件仅注入会员业务的下单/查单适配器与套餐摘要卡片，不再持有状态机。
 */

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { fetchIndustryPrefs } from "@/core/api/industry-prefs";
import PaymentModalCore from "@/shared/components/PaymentModalCore";
import { createOrder, getOrderStatus } from "../api";

type IndustryOption = { key: string; nameZh?: string; nameEn?: string };

type PaymentModalProps = {
  planCode: string;
  planName: string;
  amount: number;
  currency: string;
  noticeId?: number | null;
  returnUrl?: string;
  /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
  orderType?: "new" | "upgrade";
  /** 升级时的当前套餐 code（服务端校验用） */
  originalPlanCode?: string;
  /** 打包套餐包含的资料 ID 列表 */
  bundleItems?: string[];
  onClose: () => void;
  onPaymentSuccess: (orderNo: string) => void;
};

export default function PaymentModal({
  planCode,
  planName,
  amount,
  currency,
  noticeId,
  returnUrl,
  orderType,
  originalPlanCode,
  bundleItems,
  onClose,
  onPaymentSuccess,
}: PaymentModalProps) {
  const { t, locale } = useLocale();
  const currencySymbol = currency === "CNY" ? "¥" : "$";
  // 学习资料/打包/一次性服务不走会员行业墙；只有会员套餐需要选 L1 大类。
  const needsIndustry = !planCode.startsWith("material_")
    && !planCode.startsWith("bundle_")
    && !planCode.startsWith("svc_");
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [industryCode, setIndustryCode] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<IndustryOption[]>("/api/commodity/tree?parent="),
      fetchIndustryPrefs().catch(() => null),
    ]).then(([options, prefs]) => {
      if (!alive) return;
      setIndustries(Array.isArray(options) ? options : []);
      const preferred = String(prefs?.commodityCode || "").slice(0, 6);
      if (/^UGT-[0-9]{2}$/.test(preferred)) setIndustryCode(preferred);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const industryLabel = (o: IndustryOption) => locale === "zh" ? (o.nameZh || o.nameEn || o.key) : (o.nameEn || o.nameZh || o.key);

  // 会员下单适配器：建单响应体就是订单契约（camelCase），直接透传给统一弹窗。
  // qrCodeUrl 为服务端渲染的二维码图片（data URL），弹窗内直接扫码。
  const handleCreateOrder = useCallback(
    async (provider: "alipay" | "wechat") => createOrder({
      planCode,
      provider,
      noticeId,
      industryCode: needsIndustry ? (industryCode || undefined) : undefined,
      returnUrl,
      orderType,
      originalPlanCode,
      amount,
      bundleItems,
    }),
    [planCode, noticeId, industryCode, needsIndustry, returnUrl, orderType, originalPlanCode, amount, bundleItems],
  );

  const handleQueryStatus = useCallback((orderNo: string) => getOrderStatus(orderNo), []);

  return (
    <PaymentModalCore
      onClose={onClose}
      title={t("paymentTitle")}
      amount={amount}
      currency={currency}
      onCreateOrder={handleCreateOrder}
      onQueryStatus={handleQueryStatus}
      onSuccess={onPaymentSuccess}
      canSubmit={!needsIndustry || Boolean(industryCode)}
      chooseExtra={needsIndustry ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">
            {t("paymentIndustryLabel") || "行业大类"}
          </span>
          <select
            value={industryCode}
            onChange={(e) => setIndustryCode(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("paymentIndustryPlaceholder") || "请选择行业大类"}</option>
            {industries.map((o) => (
              <option key={o.key} value={o.key}>{industryLabel(o)}</option>
            ))}
          </select>
        </label>
      ) : undefined}
      summaryNode={
        <>
          <div className="text-sm font-bold text-slate-600">{planName}</div>
          <div className="text-3xl font-black text-slate-900">
            {currencySymbol}
            {amount.toFixed(2)}
          </div>
        </>
      }
    />
  );
}

PaymentModal.displayName = "PaymentModal";
