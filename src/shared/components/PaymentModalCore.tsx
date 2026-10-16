/**
 * 统一支付弹窗核心（零跳转弹窗支付，跨 feature 共享）— 容器
 * Unified Payment Modal Core (zero-redirect in-modal payment, shared)
 *
 * @module shared/components/PaymentModalCore
 * @description 从 features/payment/components 提升至 shared 层，
 *              消除 training → payment 跨 feature 硬依赖。
 *              状态机与轮询逻辑拆分至 usePaymentFlow hook。
 *              2026-10 组件化拆分（284→约 110 行）：四个步骤面板见 ./payment-modal/steps，
 *              JSX 逐字不变；本文件只做 hook 接线与步骤装配。
 */

import { type ReactNode } from "react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import { usePaymentFlow, type PaymentModalOrder } from "@/shared/hooks/usePaymentFlow";
import { ChooseStep, WaitingStep, SuccessStep, FailedStep, type ProviderOption } from "./payment-modal/steps";

export type { PaymentModalOrder };
export type PaymentModalStep = "choose" | "waiting" | "success" | "failed";

/** 各环节文案覆写（缺省使用会员支付 payment* 文案） */
export interface PaymentModalTexts {
  waitingTitle?: string;
  waitingDesc?: string;
  successTitle?: string;
  successDesc?: string;
  failedTitle?: string;
  mockNote?: string;
}

export interface PaymentModalCoreProps {
  onClose: () => void;
  /** 弹窗标题 */
  title: string;
  /** 订单金额（展示于确认按钮） */
  amount: number;
  currency: string;
  /** 摘要卡片内容（套餐/课程信息） */
  summaryNode: ReactNode;
  /** choose 步骤支付方式选择前的附加内容（如研修班参训人数选择器） */
  chooseExtra?: ReactNode;
  /** 是否允许提交（附加业务校验，如课程有效性） */
  canSubmit?: boolean;
  /** 确认按钮配色（会员 teal / 研修班 red） */
  accent?: "teal" | "red";
  texts?: PaymentModalTexts;
  /** 创建订单适配器（失败直接 throw，核心统一映射友好提示） */
  onCreateOrder: (provider: "alipay" | "wechat") => Promise<PaymentModalOrder>;
  /** 轮询订单状态适配器 */
  onQueryStatus: (orderNo: string) => Promise<{ status: string }>;
  /** mock 订单手动确认（可选）；不传则等待 mock 通道自动到账 */
  onMockConfirm?: (orderNo: string) => Promise<void>;
  /** 支付成功回调（轮询到 paid 或 mock 确认后触发） */
  onSuccess?: (orderNo: string) => void;
}

export default function PaymentModalCore({
  onClose,
  title,
  amount,
  currency,
  summaryNode,
  chooseExtra,
  canSubmit = true,
  accent = "teal",
  texts,
  onCreateOrder,
  onQueryStatus,
  onMockConfirm,
  onSuccess,
}: PaymentModalCoreProps) {
  const { t } = useLocale();
  const currencySymbol = currency === "CNY" ? "¥" : "$";

  const flow = usePaymentFlow({
    canSubmit,
    onCreateOrder,
    onQueryStatus,
    onMockConfirm,
    onSuccess,
    t,
  });

  const accentBtnClass = accent === "red" ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      closeOnBackdrop={false}
      closeOnEsc={false}
      closeOnDrag={false}
    >
      <div className="space-y-5">
        {/* 金额摘要（套餐/课程信息由各业务注入） */}
        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">{summaryNode}</div>

        {/* Step: choose */}
        {flow.step === "choose" && (
          <ChooseStep
            chooseExtra={chooseExtra}
            providers={flow.providers as ProviderOption[]}
            provider={flow.provider}
            paymentConfig={flow.paymentConfig}
            onSelectProvider={flow.handleSelectProvider}
            providerTip={flow.getProviderTip}
            error={flow.error}
            isCreating={flow.isCreating}
            canSubmit={canSubmit}
            onCreateOrder={flow.handleCreateOrder}
            accentBtnClass={accentBtnClass}
            currencySymbol={currencySymbol}
            amount={amount}
          />
        )}

        {/* Step: waiting（零跳转：弹窗内扫码） */}
        {flow.step === "waiting" && flow.order && (
          <WaitingStep
            order={flow.order}
            qrImage={flow.qrImage}
            texts={texts ?? {}}
            onMockConfirm={onMockConfirm}
            handleMockConfirm={flow.handleMockConfirm}
            handleOpenPayUrl={flow.handleOpenPayUrl}
          />
        )}

        {/* Step: success */}
        {flow.step === "success" && (
          <SuccessStep order={flow.order} texts={texts ?? {}} onClose={onClose} />
        )}

        {/* Step: failed */}
        {flow.step === "failed" && (
          <FailedStep error={flow.error} texts={texts ?? {}} onRetry={flow.handleRetry} />
        )}
      </div>
    </Modal>
  );
}

PaymentModalCore.displayName = "PaymentModalCore";
