/**
 * 研修班动态支付弹窗（红框）
 * Training Dynamic Payment Modal (red border)
 *
 * @module features/training/components/TrainingPaymentModal
 * @description 集成现有支付策略：创建培训订单（金额从 DB 读取）→ 展示二维码/支付链接
 *              → 轮询订单状态 → 支付成功自动确认。mock 模式提供手动确认按钮。
 *              状态机：choose → waiting → success / failed。
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import {
  createTrainingOrder,
  fetchTrainingOrderStatus,
  mockPayTrainingOrder,
  type LandingCourse,
  type TrainingOrderResponse,
} from "../api";

type Step = "choose" | "waiting" | "success" | "failed";

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
  const [step, setStep] = useState<Step>("choose");
  const [provider, setProvider] = useState<"alipay" | "wechat">("alipay");
  const [participantCount, setParticipantCount] = useState(1);
  const [order, setOrder] = useState<TrainingOrderResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const unitPrice = course?.unit_price ?? 0;
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  // 轮询订单状态
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((orderNo: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchTrainingOrderStatus(orderNo);
        if (status.status === "paid") {
          stopPolling();
          setStep("success");
        } else if (status.status === "expired" || status.status === "failed") {
          stopPolling();
          setStep("failed");
        }
      } catch {
        // 忽略单次轮询失败
      }
    }, 3000);
  }, [stopPolling]);

  const handleCreateOrder = useCallback(async () => {
    if (!course) return;
    setIsCreating(true);
    setError("");
    try {
      const result = await createTrainingOrder({
        course_id: course.id,
        schedule_id: scheduleId ?? null,
        registration_id: registrationId ?? null,
        participant_count: participantCount,
        provider,
      });
      setOrder(result);
      setStep("waiting");
      startPolling(result.order_no);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("tlPaymentFailed"));
    } finally {
      setIsCreating(false);
    }
  }, [course, scheduleId, registrationId, participantCount, provider, startPolling, t]);

  const handleMockConfirm = useCallback(async () => {
    if (!order) return;
    try {
      await mockPayTrainingOrder(order.order_no);
      stopPolling();
      setStep("success");
    } catch {
      setStep("failed");
    }
  }, [order, stopPolling]);

  return (
    <Modal open onClose={onClose} title={t("tlPaymentModalTitle")}>
      <div className="space-y-5">
        {/* 金额信息 */}
        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">{course?.name_zh}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-white">
              {t("tlPaymentParticipants")}: {participantCount}
            </span>
          </div>
          <div className="mt-1 text-3xl font-black text-slate-900">
            ¥{totalAmount.toFixed(2)}
            <span className="ml-1 text-sm font-bold text-slate-400">{t("tlPricePerPerson")}</span>
          </div>
        </div>

        {/* Step: choose */}
        {step === "choose" && (
          <>
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

            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">{t("tlPaymentSelectMethod")}</p>
              <div className="space-y-2">
                {(["alipay", "wechat"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 transition-all ${
                      provider === p ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="font-bold text-slate-800">
                      {p === "alipay" ? t("tlPaymentAlipay") : t("tlPaymentWechat")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={isCreating || !course}
              className={`w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all ${
                isCreating ? "bg-slate-400" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("tlPaymentCreating")}
                </span>
              ) : (
                `${t("tlPaymentConfirm")} ¥${totalAmount.toFixed(2)}`
              )}
            </button>
          </>
        )}

        {/* Step: waiting（红框付款二维码区域） */}
        {step === "waiting" && order && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-red-500 bg-red-50/40 p-5 text-center">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-red-600" />
              <p className="text-sm font-bold text-red-900">{t("tlPaymentWaiting")}</p>
              <p className="mt-1 text-xs text-red-700">{t("tlPaymentWaitingDesc")}</p>

              {order.qr_code ? (
                <div className="mx-auto mt-4 w-fit overflow-hidden rounded-xl border-4 border-red-500 bg-white p-2">
                  <img src={order.qr_code} alt={t("tlPaymentWaiting")} className="h-48 w-48 object-contain" />
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {order.pay_url && (
                    <a
                      href={order.pay_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-sm font-bold text-white hover:bg-slate-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("tlPaymentWaiting")}
                    </a>
                  )}
                  {order.provider === "mock" && (
                    <>
                      <p className="text-xs text-slate-500">{t("tlPaymentMockNote")}</p>
                      <button
                        type="button"
                        onClick={handleMockConfirm}
                        className="w-full rounded-2xl bg-teal-600 py-3 text-sm font-black text-white hover:bg-teal-700"
                      >
                        {t("tlPaymentConfirm")}
                      </button>
                    </>
                  )}
                </div>
              )}

              <p className="mt-3 font-mono text-xs text-slate-400">
                {t("tlPaymentOrderNo")}: {order.order_no}
              </p>
            </div>
          </div>
        )}

        {/* Step: success */}
        {step === "success" && (
          <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-teal-600" />
            <p className="text-lg font-black text-teal-800">{t("tlPaymentSuccess")}</p>
            <p className="mt-1 text-sm text-teal-700">{t("tlPaymentSuccessDesc")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-2xl bg-teal-600 py-3 text-sm font-black text-white hover:bg-teal-700"
            >
              {t("tlPaymentDone")}
            </button>
          </div>
        )}

        {/* Step: failed */}
        {step === "failed" && (
          <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-center">
            <AlertCircle className="mx-auto mb-3 h-12 w-12 text-rose-600" />
            <p className="text-lg font-black text-rose-800">{t("tlPaymentFailed")}</p>
            <button
              type="button"
              onClick={() => { setStep("choose"); setOrder(null); }}
              className="mt-4 w-full rounded-2xl bg-rose-600 py-3 text-sm font-black text-white hover:bg-rose-700"
            >
              {t("tlPaymentRetry")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

TrainingPaymentModal.displayName = "TrainingPaymentModal";
