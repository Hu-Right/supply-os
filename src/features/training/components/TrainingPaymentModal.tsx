/**
 * 研修班支付弹窗（统一核心的研修班侧薄封装）
 * Training Payment Modal (thin wrapper over the unified core)
 *
 * @module features/training/components/TrainingPaymentModal
 * @description 支付流程统一收敛至 PaymentModalCore（零跳转弹窗支付）：
 *              本组件仅注入培训业务的下单/查单/mock 确认适配器、课程摘要卡片
 *              与参训人数选择器；弹窗内扫码完成付款，无任何页面跳转。
 */

import { useCallback, useState } from "react";
import { useLocale } from "@/core/i18n";
import { PaymentModalCore } from "@/features/payment";
import {
  createTrainingOrder,
  fetchTrainingOrderStatus,
  mockPayTrainingOrder,
  type LandingCourse,
} from "../api";

export interface TrainingPaymentModalProps {
  onClose: () => void;
  course: LandingCourse | null;
  registrationId?: number | null;
  scheduleId?: number | null;
}

export default function TrainingPaymentModal({
  onClose,
  course,
  registrationId,
  scheduleId,
}: TrainingPaymentModalProps) {
  const { t } = useLocale();
  const [participantCount, setParticipantCount] = useState(1);

  const unitPrice = course?.unit_price ?? 0;
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  // 培训下单适配器：qr_code 为服务端渲染的二维码图片（data URL），弹窗内直接扫码
  const handleCreateOrder = useCallback(
    async (provider: "alipay" | "wechat") => {
      if (!course) throw new Error("COURSE_NOT_FOUND");
      const result = await createTrainingOrder({
        course_id: course.id,
        schedule_id: scheduleId ?? null,
        registration_id: registrationId ?? null,
        participant_count: participantCount,
        provider,
      });
      return {
        order_no: result.order_no,
        provider: result.provider,
        qr_code: result.qr_code,
        pay_url: result.pay_url,
      };
    },
    [course, scheduleId, registrationId, participantCount],
  );

  const handleQueryStatus = useCallback((orderNo: string) => fetchTrainingOrderStatus(orderNo), []);

  const handleMockConfirm = useCallback(async (orderNo: string) => {
    await mockPayTrainingOrder(orderNo);
  }, []);

  return (
    <PaymentModalCore
      onClose={onClose}
      title={t("tlPaymentModalTitle")}
      amount={totalAmount}
      currency={course?.currency ?? "CNY"}
      accent="red"
      canSubmit={Boolean(course)}
      onCreateOrder={handleCreateOrder}
      onQueryStatus={handleQueryStatus}
      onMockConfirm={handleMockConfirm}
      texts={{
        waitingTitle: t("tlPaymentWaiting"),
        waitingDesc: t("tlPaymentWaitingDesc"),
        successTitle: t("tlPaymentSuccess"),
        successDesc: t("tlPaymentSuccessDesc"),
        failedTitle: t("tlPaymentFailed"),
        mockNote: t("tlPaymentMockNote"),
      }}
      summaryNode={
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">{course?.name_zh}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-white">
              {t("tlPaymentParticipants")}: {participantCount}
            </span>
          </div>
          <div className="mt-1 text-3xl font-black text-slate-900">
            ¥{totalAmount.toFixed(2)}
            <span className="ms-1 text-sm font-bold text-slate-400">{t("tlPricePerPerson")}</span>
          </div>
        </>
      }
      chooseExtra={
        <div>
          <p className="mb-2 text-sm font-bold text-slate-700">{t("tlPaymentParticipants")}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setParticipantCount((c) => Math.max(1, c - 1))}
              className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50"
            >
              -
            </button>
            <span className="w-10 text-center text-lg font-black text-slate-900">{participantCount}</span>
            <button
              type="button"
              onClick={() => setParticipantCount((c) => Math.min(20, c + 1))}
              className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        </div>
      }
    />
  );
}

TrainingPaymentModal.displayName = "TrainingPaymentModal";
