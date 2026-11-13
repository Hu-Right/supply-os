/**
 * 研修班支付弹窗（统一核心的研修班侧薄封装）
 * Training Payment Modal (thin wrapper over the unified core)
 *
 * @module features/training/components/TrainingPaymentModal
 * @description 两阶段流程：先填写企业信息 + 学员名单 → 再扫码支付。
 *
 *              2026-11-13 收敛：学员名单在**进入支付前**就一次性写入 training_enrollments
 *              （一行一人），下单只把订单号绑到这批行上；支付成功后不再补写任何名单。
 *              此前「支付成功后异步保存学员」的 fire-and-forget 会造成「钱到了、名单没了」，
 *              现已在结构上消除。
 */

import { useCallback, useState } from "react";
import { useLocale } from "@/core/i18n";
import { Button, SelectableCard } from "@/shared/ui";
import { formatScheduleDate } from "@/shared/utils/format";
import PaymentModalCore from "@/shared/components/PaymentModalCore";
import type { LandingCourse, LandingSchedule, ParticipantInput } from "../api";
import { ApiError } from "@/core/http";
import { submitTrainingRegister } from "../api";
import CompanyInfoSection, { type CompanyInfoData } from "./CompanyInfoSection";
import ParticipantForm from "./ParticipantForm";
import { useTrainingSchedule } from "../hooks/useTrainingSchedule";
import { useTrainingOrder } from "../hooks/useTrainingOrder";

export interface TrainingPaymentModalProps {
  onClose: () => void;
  course: LandingCourse | null;
  /** 可选期次列表；若有多期则强制用户选择后才能下单 */
  schedules: LandingSchedule[];
  /** 外部预设期次（如从 ScheduleSection 点选进入），优先级最高 */
  defaultScheduleId?: number | null;
}

export default function TrainingPaymentModal({
  onClose,
  course,
  schedules,
  defaultScheduleId,
}: TrainingPaymentModalProps) {
  const { t, locale } = useLocale();

  // ── 两阶段流程 ──
  const [phase, setPhase] = useState<"participants" | "payment">("participants");
  /** 报名接口返回的行 id（顺序对应每位学员），下单时回传用于绑定订单 */
  const [registrationIds, setRegistrationIds] = useState<number[] | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoData>({
    company_name: "",
    main_product: "",
    export_experience: "",
    certification: [],
    other_certification: "",
    remark: "",
    email: "",
    full_name: "",
    gender: "",
    phone: "",
    position: "",
    schedule_id: null,
  });
  const [submittingCompany, setSubmittingCompany] = useState(false);
  const [companyError, setCompanyError] = useState("");

  // ── 期次选择与人数 ──
  const {
    openSchedules, selectedScheduleId, setSelectedScheduleId,
    participantCount, setParticipantCount,
    totalAmount, hasMultipleSchedules, selectedSchedule,
  } = useTrainingSchedule(schedules, course, defaultScheduleId);

  // ── 订单与支付 ──
  const { handleCreateOrder, handleQueryStatus, handleMockConfirm, handlePaymentSuccess } =
    useTrainingOrder(course, selectedScheduleId, registrationIds, onClose);

  // ── 阶段一：企业信息 + 学员名单 → 一次写全报名 → 进入支付 ──
  const handleParticipantsReady = useCallback(async (participants: ParticipantInput[]) => {
    if (!companyInfo.company_name.trim()) {
      setCompanyError(t("tlCompanyInfoRequired"));
      return;
    }
    const first = participants[0];
    if (!first?.full_name?.trim() || !first?.phone?.trim()) {
      setCompanyError(t("tlCompanyInfoRequired"));
      return;
    }
    if (selectedScheduleId == null) {
      setCompanyError(t("tlPaymentScheduleRequired"));
      return;
    }

    setSubmittingCompany(true);
    setCompanyError("");

    try {
      let certificationStr = companyInfo.certification.join("\n");
      if (companyInfo.other_certification.trim()) {
        certificationStr += "\n" + companyInfo.other_certification.trim();
      }

      const result = await submitTrainingRegister({
        company_name: companyInfo.company_name,
        main_product: companyInfo.main_product,
        export_experience: companyInfo.export_experience,
        certification: certificationStr,
        remark: companyInfo.remark,
        email: companyInfo.email,
        schedule_id: selectedScheduleId,
        participants,
      });

      setRegistrationIds(result.ids);
      setPhase("payment");
    } catch (err) {
      setCompanyError(err instanceof ApiError ? err.message : t("formError"));
    } finally {
      setSubmittingCompany(false);
    }
  }, [companyInfo, selectedScheduleId, t]);

  // ── 阶段一：学员信息填写 ──
  if (phase === "participants") {
    return (
      <ParticipantForm
        open
        onClose={onClose}
        orderNo=""
        participantCount={participantCount}
        onSubmit={handleParticipantsReady}
        preFormSection={<CompanyInfoSection value={companyInfo} onChange={setCompanyInfo} showStudent={false} />}
        preFormError={companyError}
        preFormSubmitting={submittingCompany}
        scheduleSelector={
          hasMultipleSchedules ? (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">{t("tlPaymentScheduleLabel")}</p>
              <div className="space-y-2">
                {openSchedules.map((s) => {
                  const isSelected = s.id === selectedScheduleId;
                  return (
                    <SelectableCard
                      key={s.id}
                      selected={isSelected}
                      onClick={() => setSelectedScheduleId(s.id)}
                      variant="brand"
                      className="flex items-center justify-between p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          {t("tlPaymentSchedulePeriod").replace("{n}", String(s.periodNumber))}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatScheduleDate(s.startDate, locale)} · {s.city} · {s.format}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-bold text-emerald-700">
                        {t("tlPaymentScheduleStatusOpen")}
                      </span>
                    </SelectableCard>
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setParticipantCount((c) => Math.max(1, c - 1))}
                aria-label={t("tlPaymentParticipants")}
                className="text-lg font-bold text-slate-600"
              >
                -
              </Button>
              <span className="w-10 text-center text-lg font-black text-slate-900">{participantCount}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setParticipantCount((c) => Math.min(20, c + 1))}
                aria-label={t("tlPaymentParticipants")}
                className="text-lg font-bold text-slate-600"
              >
                +
              </Button>
            </div>
          </div>
        }
        scheduleRequired={selectedScheduleId == null}
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
      canSubmit={Boolean(course) && selectedScheduleId != null && (registrationIds?.length ?? 0) > 0}
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
            <span className="text-sm font-bold text-slate-600">{course?.nameZh}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-white">
              {t("tlPaymentParticipants")}: {participantCount}
            </span>
          </div>
          {selectedSchedule && (
            <p className="mt-1 text-xs text-slate-500">
              {t("tlPaymentSchedulePeriod").replace("{n}", String(selectedSchedule.periodNumber))}
              {" · "}
              {formatScheduleDate(selectedSchedule.startDate, locale)}
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
            ✓ {registrationIds?.length ?? 0} {t("tlPaymentParticipants")}信息已提交
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            学员名单已随报名保存，支付成功即可开课
          </p>
        </div>
      }
    />
  );
}

TrainingPaymentModal.displayName = "TrainingPaymentModal";
