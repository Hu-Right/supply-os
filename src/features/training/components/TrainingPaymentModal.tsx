/**
 * 研修班支付弹窗（统一核心的研修班侧薄封装）
 * Training Payment Modal (thin wrapper over the unified core)
 *
 * @module features/training/components/TrainingPaymentModal
 * @description 支付流程统一收敛至 PaymentModalCore（零跳转弹窗支付）：
 *              两阶段流程：先填写学员信息 → 再扫码支付 → 支付成功后自动保存学员信息。
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
import type { EnrolledStudentInfo } from "../api";
import { useTrainingSchedule } from "../hooks/useTrainingSchedule";
import { useTrainingOrder } from "../hooks/useTrainingOrder";

export interface TrainingPaymentModalProps {
  onClose: () => void;
  course: LandingCourse | null;
  /** 可选期次列表；若有多期则强制用户选择后才能下单 */
  schedules: LandingSchedule[];
  registrationId?: number | null;
  /** 外部预设期次（如从 ScheduleSection 点选进入），优先级最高 */
  defaultScheduleId?: number | null;
  /** 报名时已提交的学员本人：预填第一名学员，避免重复录入 */
  prefillStudent?: EnrolledStudentInfo | null;
}

export default function TrainingPaymentModal({
  onClose,
  course,
  schedules,
  registrationId,
  defaultScheduleId,
  prefillStudent,
}: TrainingPaymentModalProps) {
  const { t, locale } = useLocale();

  // ── 两阶段流程 ──
  const [phase, setPhase] = useState<"participants" | "payment">("participants");
  const [pendingParticipants, setPendingParticipants] = useState<ParticipantInput[] | null>(null);
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
    totalAmount, hasMultipleSchedules, scheduleSelected, selectedSchedule,
  } = useTrainingSchedule(schedules, course, prefillStudent?.schedule_id ?? defaultScheduleId);

  // ── 订单与支付 ──
  const { handleCreateOrder, handleQueryStatus, handleMockConfirm, handlePaymentSuccess } =
    useTrainingOrder(course, selectedScheduleId, registrationId, participantCount, pendingParticipants, onClose);

  // ── 阶段一：学员信息填写完成 → 先提交公司信息 → 再进入支付阶段 ──
  const handleParticipantsReady = useCallback(async (participants: ParticipantInput[]) => {
    // 来自报名表单的流程（registrationId 有值）：报名已提交过，不能再插一条，
    // 否则同一个用户会留下两条报名记录。直接带学员进支付阶段。
    if (registrationId) {
      setPendingParticipants(participants);
      setPhase("payment");
      return;
    }

    // 学员字段由 ParticipantForm 统一收集（每位学员一份），这里只校验企业信息；
    // 报名人的姓名/电话取自第一位学员，避免同一份信息收两遍。
    if (!companyInfo.company_name) {
      setCompanyError(t("tlCompanyInfoRequired"));
      return;
    }
    const first = participants[0];
    if (!first?.full_name?.trim() || !first?.phone?.trim()) {
      setCompanyError(t("tlCompanyInfoRequired"));
      return;
    }

    setSubmittingCompany(true);
    setCompanyError("");

    try {
      let certificationStr = companyInfo.certification.join("\n");
      if (companyInfo.other_certification.trim()) {
        certificationStr += "\n" + companyInfo.other_certification.trim();
      }

      await submitTrainingRegister({
        company_name: companyInfo.company_name,
        main_product: companyInfo.main_product,
        export_experience: companyInfo.export_experience,
        certification: certificationStr,
        remark: companyInfo.remark,
        email: companyInfo.email,
        full_name: first.full_name,
        gender: first.gender ?? null,
        phone: first.phone ?? "",
        position: first.position ?? "",
        schedule_id: selectedScheduleId ?? null,
      });

      setPendingParticipants(participants);
      setPhase("payment");
    } catch (err) {
      setCompanyError(err instanceof ApiError ? err.message : t("formError"));
    } finally {
      setSubmittingCompany(false);
    }
  }, [companyInfo, t, registrationId]);

  // ── 阶段一：学员信息填写 ──
  if (phase === "participants") {
    return (
      <ParticipantForm
        open
        onClose={onClose}
        orderNo=""
        participantCount={participantCount}
        onSubmit={handleParticipantsReady}
        preFormSection={
          // 从报名表单进来时（registrationId 有值）公司信息已提交，不再重复展示
          registrationId ? null : <CompanyInfoSection value={companyInfo} onChange={setCompanyInfo} showStudent={false} />
        }
        preFormError={companyError}
        preFormSubmitting={submittingCompany}
        initialParticipant={prefillStudent ?? null}
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
