/**
 * 研修班支付弹窗（统一核心的研修班侧薄封装）
 * Training Payment Modal (thin wrapper over the unified core)
 *
 * @module features/training/components/TrainingPaymentModal
 * @description 支付流程统一收敛至 PaymentModalCore（零跳转弹窗支付）：
 *              两阶段流程：先填写学员信息 → 再扫码支付 → 支付成功后自动保存学员信息。
 */

import { useCallback, useMemo, useState } from "react";
import { useLocale } from "@/core/i18n";
import { PaymentModalCore } from "@/features/payment";
import {
  createTrainingOrder,
  fetchTrainingOrderStatus,
  mockPayTrainingOrder,
  saveTrainingParticipants,
  type LandingCourse,
  type LandingSchedule,
  type TrainingParticipant,
} from "../api";
import ParticipantForm from "./ParticipantForm";

export interface TrainingPaymentModalProps {
  onClose: () => void;
  course: LandingCourse | null;
  /** 可选期次列表；若有多期则强制用户选择后才能下单 */
  schedules: LandingSchedule[];
  registrationId?: number | null;
  /** 外部预设期次（如从 ScheduleSection 点选进入），优先级最高 */
  defaultScheduleId?: number | null;
}

/** 期次日期 → 2026年1月20日 格式 */
function fmtDate(d: string | Date, locale: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return locale === "zh"
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export default function TrainingPaymentModal({
  onClose,
  course,
  schedules,
  registrationId,
  defaultScheduleId,
}: TrainingPaymentModalProps) {
  const { t, locale } = useLocale();

  // ── 两阶段流程 ──
  // phase="participants" → 先填学员信息
  // phase="payment" → 再支付
  const [phase, setPhase] = useState<"participants" | "payment">("participants");
  const [pendingParticipants, setPendingParticipants] = useState<TrainingParticipant[] | null>(null);

  // ── 期次选择 ──
  const openSchedules = useMemo(() => schedules.filter((s) => s.status === "open"), [schedules]);

  const initialScheduleId = useMemo(() => {
    if (defaultScheduleId) return defaultScheduleId;
    if (openSchedules.length === 0) return null;
    return openSchedules[0].id;
  }, [defaultScheduleId, openSchedules]);

  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(initialScheduleId);

  // ── 参训人数 ──
  const [participantCount, setParticipantCount] = useState(1);

  const unitPrice = course?.unit_price ?? 0;
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  const hasMultipleSchedules = openSchedules.length > 1;
  const scheduleSelected = !hasMultipleSchedules || selectedScheduleId !== null;

  // ── 阶段一：学员信息填写完成 → 进入支付阶段 ──
  const handleParticipantsReady = useCallback((participants: TrainingParticipant[]) => {
    setPendingParticipants(participants);
    setPhase("payment");
  }, []);

  // ── 培训下单适配器 ──
  const handleCreateOrder = useCallback(
    async (provider: "alipay" | "wechat") => {
      if (!course) throw new Error("COURSE_NOT_FOUND");
      const result = await createTrainingOrder({
        course_id: course.id,
        schedule_id: selectedScheduleId ?? null,
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
    [course, selectedScheduleId, registrationId, participantCount],
  );

  const handleQueryStatus = useCallback((orderNo: string) => fetchTrainingOrderStatus(orderNo), []);

  const handleMockConfirm = useCallback(async (orderNo: string) => {
    await mockPayTrainingOrder(orderNo);
  }, []);

  // ── 支付成功回调：先展示成功 UI，再异步保存学员信息 ──
  const handlePaymentSuccess = useCallback((orderNo: string) => {
    if (pendingParticipants) {
      // 异步保存，不阻塞成功 UI 展示
      saveTrainingParticipants(orderNo, pendingParticipants)
        .then(() => console.log(`[TrainingPayment] 学员信息已保存 (order: ${orderNo})`))
        .catch((err) => console.error(`[TrainingPayment] 学员信息保存失败 (order: ${orderNo}):`, err));
    }
    // 延迟关闭，让用户看到成功页
    setTimeout(onClose, 2000);
  }, [pendingParticipants, onClose]);

  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId) ?? null;

  // ── 阶段一：学员信息填写 ──
  if (phase === "participants") {
    return (
      <ParticipantForm
        open
        onClose={onClose}
        orderNo=""
        participantCount={participantCount}
        onSubmit={handleParticipantsReady}
        scheduleSelector={
          hasMultipleSchedules ? (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">{t("tlPaymentScheduleLabel")}</p>
              <div className="space-y-2">
                {openSchedules.map((s) => {
                  const isSelected = s.id === selectedScheduleId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedScheduleId(s.id)}
                      className={`flex w-full items-center justify-between rounded-xl border-2 p-3 text-left transition-all ${
                        isSelected
                          ? "border-red-500 bg-red-50 cursor-pointer"
                          : "border-slate-200 bg-white hover:border-slate-300 cursor-pointer"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          {t("tlPaymentSchedulePeriod").replace("{n}", String(s.period_number))}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {fmtDate(s.start_date, locale)} · {s.city} · {s.format}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {t("tlPaymentScheduleStatusOpen")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : undefined
        }
        participantCountSelector={
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
        scheduleRequired={!scheduleSelected}
        scheduleRequiredText={t("tlPaymentScheduleRequired")}
      />
    );
  }

  // ── 阶段二：支付 ──
  return (
    <PaymentModalCore
      onClose={onClose}
      title={t("tlPaymentModalTitle")}
      amount={totalAmount}
      currency={course?.currency ?? "CNY"}
      accent="red"
      canSubmit={Boolean(course) && scheduleSelected}
      onCreateOrder={handleCreateOrder}
      onQueryStatus={handleQueryStatus}
      onMockConfirm={handleMockConfirm}
      onSuccess={handlePaymentSuccess}
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
          {selectedSchedule && (
            <p className="mt-1 text-xs text-slate-500">
              {t("tlPaymentSchedulePeriod").replace("{n}", String(selectedSchedule.period_number))}
              {" · "}
              {fmtDate(selectedSchedule.start_date, locale)}
              {" · "}
              {selectedSchedule.city}
            </p>
          )}
          <div className="mt-1 text-3xl font-black text-slate-900">
            ¥{totalAmount.toFixed(2)}
            <span className="ms-1 text-sm font-bold text-slate-400">{t("tlPricePerPerson")}</span>
          </div>
        </>
      }
      chooseExtra={
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-sm font-bold text-emerald-800">
            ✓ {pendingParticipants?.length ?? 0} {t("tlPaymentParticipants")}信息已填写完成
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            支付成功后系统将自动提交学员信息
          </p>
        </div>
      }
    />
  );
}

TrainingPaymentModal.displayName = "TrainingPaymentModal";
