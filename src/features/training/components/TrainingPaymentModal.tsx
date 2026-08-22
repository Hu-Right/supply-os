/**
 * 研修班支付弹窗（统一核心的研修班侧薄封装）
 * Training Payment Modal (thin wrapper over the unified core)
 *
 * @module features/training/components/TrainingPaymentModal
 * @description 支付流程统一收敛至 PaymentModalCore（零跳转弹窗支付）：
 *              本组件仅注入培训业务的下单/查单/mock 确认适配器、课程摘要卡片、
 *              期次选择器与参训人数选择器；弹窗内扫码完成付款，无任何页面跳转。
 *              支付成功后自动弹出学员信息收集表单。
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

  // ── 期次选择 ──
  // 支付弹窗只展示"报名中"的期次
  const openSchedules = useMemo(() => schedules.filter((s) => s.status === "open"), [schedules]);

  // 如果外部传了 defaultScheduleId 则用它；否则自动选中第一个 open 的期次
  const initialScheduleId = useMemo(() => {
    if (defaultScheduleId) return defaultScheduleId;
    if (openSchedules.length === 0) return null;
    return openSchedules[0].id;
  }, [defaultScheduleId, openSchedules]);

  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(initialScheduleId);

  // ── 参训人数 ──
  const [participantCount, setParticipantCount] = useState(1);
  const [showParticipantForm, setShowParticipantForm] = useState(false);
  const [completedOrderNo, setCompletedOrderNo] = useState<string | null>(null);
  const [completedParticipantCount, setCompletedParticipantCount] = useState(0);

  const unitPrice = course?.unit_price ?? 0;
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  // 多期时必须有选中期次才能下单（基于 open 期次数量）
  const hasMultipleSchedules = openSchedules.length > 1;
  const scheduleSelected = !hasMultipleSchedules || selectedScheduleId !== null;

  // 培训下单适配器：qr_code 为服务端渲染的二维码图片（data URL），弹窗内直接扫码
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

  // 支付成功回调：打开学员信息收集表单
  const handlePaymentSuccess = useCallback((orderNo: string) => {
    setCompletedOrderNo(orderNo);
    setCompletedParticipantCount(participantCount);
    setShowParticipantForm(true);
  }, [participantCount]);

  // 提交学员信息
  const handleSubmitParticipants = useCallback(async (participants: TrainingParticipant[]) => {
    if (!completedOrderNo) throw new Error("订单号缺失");
    await saveTrainingParticipants(completedOrderNo, participants);
  }, [completedOrderNo]);

  // 关闭学员信息表单
  const handleCloseParticipantForm = useCallback(() => {
    setShowParticipantForm(false);
    onClose();
  }, [onClose]);

  // 找到当前选中期次的信息用于摘要
  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId) ?? null;

  return (
    <>
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
        <div className="space-y-4">
          {/* ── 期次选择器（多个报名中期次时展示） ── */}
          {hasMultipleSchedules && (
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
          )}

          {/* ── 参训人数选择器 ── */}
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

          {/* ── 未选期次提示 ── */}
          {hasMultipleSchedules && !scheduleSelected && (
            <p className="text-xs font-bold text-rose-500">{t("tlPaymentScheduleRequired")}</p>
          )}
        </div>
      }
    />

    {/* 学员信息收集表单 */}
    {showParticipantForm && completedOrderNo && (
      <ParticipantForm
        open={showParticipantForm}
        onClose={handleCloseParticipantForm}
        orderNo={completedOrderNo}
        participantCount={completedParticipantCount}
        onSubmit={handleSubmitParticipants}
      />
    )}
  </>
);
}

TrainingPaymentModal.displayName = "TrainingPaymentModal";
