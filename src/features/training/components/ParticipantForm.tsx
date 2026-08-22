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
import { Modal } from "@/shared/ui";
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
      setError(scheduleRequiredText || "请先选择开课期次");
      return;
    }

    // 验证必填字段
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p.full_name || !p.full_name.trim()) {
        setError(`请填写第 ${i + 1} 位学员的姓名`);
        return;
      }
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onSubmit(participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPrePaymentMode = Boolean(scheduleSelector || participantCountSelector);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPrePaymentMode ? "请填写参训学员信息" : "请填写学员信息"}
      closeOnBackdrop={false}
      closeOnEsc={false}
      className="max-w-3xl"
    >
      <div className="space-y-6">
        {/* 提示信息 */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          {orderNo ? (
            <p className="text-sm text-blue-800">
              订单号：{orderNo} | 共 {participantCount} 位学员
            </p>
          ) : (
            <p className="text-sm text-blue-800">
              共 {participantCount} 位学员
            </p>
          )}
          <p className="text-xs text-blue-600 mt-1">
            {isPrePaymentMode
              ? "填写完成后进入支付流程，支付成功后系统将自动提交学员信息"
              : "请填写每位学员的详细信息，用于生成学员名单、签到表和证书"}
          </p>
        </div>

        {/* 期次选择器（支付前模式） */}
        {scheduleSelector}

        {/* 参训人数选择器（支付前模式） */}
        {participantCountSelector}

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* 学员信息表单（固定高度，不随人数变化） */}
        <div className="h-[25vh] overflow-y-auto pr-1 space-y-3">
          {participants.map((participant, index) => (
            <div
              key={index}
              className="border border-slate-200 rounded-lg p-3 space-y-2"
            >
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1.5">
                学员 {index + 1}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    姓名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={participant.full_name}
                    onChange={(e) => handleFieldChange(index, "full_name", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="请输入学员姓名"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    性别
                  </label>
                  <select
                    value={participant.gender || ""}
                    onChange={(e) => handleFieldChange(index, "gender", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">请选择</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    电话
                  </label>
                  <input
                    type="tel"
                    value={participant.phone || ""}
                    onChange={(e) => handleFieldChange(index, "phone", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="手机号码"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    公司名称
                  </label>
                  <input
                    type="text"
                    value={participant.company_name || ""}
                    onChange={(e) => handleFieldChange(index, "company_name", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="所在公司"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    职位
                  </label>
                  <input
                    type="text"
                    value={participant.position || ""}
                    onChange={(e) => handleFieldChange(index, "position", e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="如：采购经理"
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
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 bg-[#0CAF8C] text-white rounded-lg hover:bg-[#0A9B7C] disabled:opacity-50 text-sm font-bold"
              >
                {isSubmitting ? "提交中..." : "填写完成，去支付"}
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
                稍后填写
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {isSubmitting ? "提交中..." : "提交学员信息"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

ParticipantForm.displayName = "ParticipantForm";
