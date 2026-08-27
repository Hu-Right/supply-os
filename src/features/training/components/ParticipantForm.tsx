/**
 * 学员信息收集表单
 * Participant Information Form
 *
 * @module features/training/components/ParticipantForm
 * @description 收集每个学员的详细信息，支持支付前/后两种模式。
 *              支付前模式：填写完成后调用 onSubmit 进入支付流程。
 *              支付后模式：填写完成后调用 onSubmit 保存到数据库。
 */

import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { Button, Modal } from "@/shared/ui";
import type { TrainingParticipant } from "../api";
import type { ReactNode } from "react";

export interface ParticipantFormProps {
  open: boolean;
  onClose: () => void;
  orderNo: string;
  participantCount: number;
  onSubmit: (participants: TrainingParticipant[]) => void | Promise<void>;
  /** 期次选择器（支付前模式时展示在表单顶部） */
  scheduleSelector?: ReactNode;
  /** 参训人数选择器（支付前模式时展示） */
  participantCountSelector?: ReactNode;
  /** 期次未选择时的校验提示 */
  scheduleRequired?: boolean;
  scheduleRequiredText?: string;
  /** 表单顶部额外区块（如公司信息） */
  preFormSection?: ReactNode;
  /** 顶部区块的错误提示 */
  preFormError?: string;
  /** 顶部区块的提交中状态 */
  preFormSubmitting?: boolean;
}

export default function ParticipantForm({
  open,
  onClose,
  orderNo,
  participantCount,
  onSubmit,
  scheduleSelector,
  participantCountSelector,
  scheduleRequired,
  scheduleRequiredText,
  preFormSection,
  preFormError,
  preFormSubmitting,
}: ParticipantFormProps) {
  const { t } = useLocale();
  const [participants, setParticipants] = useState<TrainingParticipant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 初始化学员表单（仅在弹窗打开时初始化）
  useEffect(() => {
    if (open && participantCount > 0 && participants.length === 0) {
      const initialParticipants: TrainingParticipant[] = Array.from(
        { length: participantCount },
        (_, i) => ({
          participant_no: i + 1,
          full_name: "",
          gender: null,
          phone: null,
          company_name: null,
          position: null,
          email: null,
        })
      );
      setParticipants(initialParticipants);
      setError("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 人数变化时平滑增减条目（保留已填数据）
  useEffect(() => {
    if (participantCount <= 0) return;
    setParticipants(prev => {
      if (prev.length === participantCount) return prev;
      if (participantCount > prev.length) {
        // 增加：追加空条目
        const newEntries = Array.from(
          { length: participantCount - prev.length },
          (_, i) => ({
            participant_no: prev.length + i + 1,
            full_name: "",
            gender: null,
            phone: null,
            company_name: null,
            position: null,
            email: null,
          })
        );
        return [...prev, ...newEntries];
      }
      // 减少：截断尾部
      return prev.slice(0, participantCount);
    });
  }, [participantCount]);

  const handleFieldChange = (index: number, field: keyof TrainingParticipant, value: string | null) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async () => {
    // 期次校验
    if (scheduleRequired) {
      setError(scheduleRequiredText || t("tlParticipantScheduleRequired"));
      return;
    }

    // 验证必填字段
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p.full_name || !p.full_name.trim()) {
        setError(t("tlParticipantNameRequired", { index: String(i + 1) }));
        return;
      }
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onSubmit(participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tlParticipantSubmitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPrePaymentMode = Boolean(scheduleSelector || participantCountSelector);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPrePaymentMode ? t("tlParticipantTitlePrePay") : t("tlParticipantTitlePostPay")}
      closeOnBackdrop={false}
      closeOnEsc={false}
      className="max-w-5xl"
    >
      <div className="max-h-[75vh] overflow-y-auto pr-1 space-y-6">
        {/* 提示信息 */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          {orderNo ? (
            <p className="text-sm text-blue-800">
              {t("tlParticipantOrderInfo", { orderNo, count: String(participantCount) })}
            </p>
          ) : (
            <p className="text-sm text-blue-800">
              {t("tlParticipantCountInfo", { count: String(participantCount) })}
            </p>
          )}
          <p className="text-xs text-blue-600 mt-1">
            {isPrePaymentMode
              ? t("tlParticipantHintPrePay")
              : t("tlParticipantHintPostPay")}
          </p>
        </div>

        {/* 期次选择器（支付前模式） */}
        {scheduleSelector}

        {/* 参训人数选择器（支付前模式） */}
        {participantCountSelector}

        {/* 顶部额外区块（如公司信息） */}
        {preFormSection && (
          <div className="border-t border-slate-200 pt-4">
            {preFormSection}
          </div>
        )}
        {preFormError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-800">{preFormError}</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* 学员信息表单 */}
        <div className="space-y-3">
          {participants.map((participant, index) => (
            <div
              key={index}
              className="border border-slate-200 rounded-lg p-3 space-y-2"
            >
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1.5">
                {t("tlParticipantHeader", { index: String(index + 1) })}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {t("tlParticipantNameLabel")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={participant.full_name}
                    onChange={(e) => handleFieldChange(index, "full_name", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={t("tlParticipantNamePlaceholder")}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {t("tlParticipantGenderLabel")}
                  </label>
                  <select
                    value={participant.gender || ""}
                    onChange={(e) => handleFieldChange(index, "gender", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">{t("tlParticipantGenderSelect")}</option>
                    <option value="male">{t("tlParticipantGenderMale")}</option>
                    <option value="female">{t("tlParticipantGenderFemale")}</option>
                    <option value="other">{t("tlParticipantGenderOther")}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {t("tlParticipantPhoneLabel")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={participant.phone || ""}
                    onChange={(e) => handleFieldChange(index, "phone", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={t("tlParticipantPhonePlaceholder")}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {t("tlParticipantCompanyLabel")}
                  </label>
                  <input
                    type="text"
                    value={participant.company_name || ""}
                    onChange={(e) => handleFieldChange(index, "company_name", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={t("tlParticipantCompanyPlaceholder")}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {t("tlParticipantPositionLabel")}
                  </label>
                  <input
                    type="text"
                    value={participant.position || ""}
                    onChange={(e) => handleFieldChange(index, "position", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={t("tlParticipantPositionPlaceholder")}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {t("tlParticipantEmailLabel")}
                  </label>
                  <input
                    type="email"
                    value={participant.email || ""}
                    onChange={(e) => handleFieldChange(index, "email", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={t("tlParticipantEmailPlaceholder")}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          {isPrePaymentMode ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || preFormSubmitting}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold"
              >
                {t("tlParticipantCancel")}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || preFormSubmitting}
                className="flex-1 px-4 py-2.5 bg-[#0CAF8C] text-white rounded-lg hover:bg-[#0A9B7C] disabled:opacity-50 text-sm font-bold"
              >
                {isSubmitting || preFormSubmitting ? t("tlParticipantSubmitting") : t("tlParticipantSubmitPrePay")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("tlParticipantLater")}
              </button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2"
              >
                {isSubmitting ? t("tlParticipantSubmitting") : t("tlParticipantSubmitPostPay")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

ParticipantForm.displayName = "ParticipantForm";
