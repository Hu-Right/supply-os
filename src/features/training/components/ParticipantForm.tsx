/**
 * 学员信息收集表单
 * Participant Information Form
 *
 * @module features/training/components/ParticipantForm
 * @description 支付完成后收集每个学员的详细信息
 *              Collect detailed information for each participant after payment
 */

import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import type { TrainingParticipant } from "../api";

export interface ParticipantFormProps {
  open: boolean;
  onClose: () => void;
  orderNo: string;
  participantCount: number;
  onSubmit: (participants: TrainingParticipant[]) => Promise<void>;
}

export default function ParticipantForm({
  open,
  onClose,
  orderNo,
  participantCount,
  onSubmit,
}: ParticipantFormProps) {
  const { t } = useLocale();
  const [participants, setParticipants] = useState<TrainingParticipant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 初始化学员表单
  useEffect(() => {
    if (open && participantCount > 0) {
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
  }, [open, participantCount]);

  const handleFieldChange = (index: number, field: keyof TrainingParticipant, value: string | null) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async () => {
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="请填写学员信息"
      closeOnBackdrop={false}
      closeOnEsc={false}
      className="max-w-3xl"
    >
      <div className="space-y-6">
        {/* 提示信息 */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm text-blue-800">
            订单号：{orderNo} | 共 {participantCount} 位学员
          </p>
          <p className="text-xs text-blue-600 mt-1">
            请填写每位学员的详细信息，用于生成学员名单、签到表和证书
          </p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* 学员信息表单 */}
        <div className="space-y-8">
          {participants.map((participant, index) => (
            <div
              key={index}
              className="border border-slate-200 rounded-lg p-4 space-y-4"
            >
              <h3 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-2">
                学员 {index + 1}
              </h3>

              {/* 学员基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    姓名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={participant.full_name}
                    onChange={(e) => handleFieldChange(index, "full_name", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="请输入学员姓名"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    性别
                  </label>
                  <select
                    value={participant.gender || ""}
                    onChange={(e) => handleFieldChange(index, "gender", e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">请选择</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    电话
                  </label>
                  <input
                    type="tel"
                    value={participant.phone || ""}
                    onChange={(e) => handleFieldChange(index, "phone", e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="手机号码"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    公司名称
                  </label>
                  <input
                    type="text"
                    value={participant.company_name || ""}
                    onChange={(e) => handleFieldChange(index, "company_name", e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="所在公司"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    职位
                  </label>
                  <input
                    type="text"
                    value={participant.position || ""}
                    onChange={(e) => handleFieldChange(index, "position", e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="如：采购经理"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
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
        </div>
      </div>
    </Modal>
  );
}

ParticipantForm.displayName = "ParticipantForm";
