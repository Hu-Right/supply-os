/**
 * 单个学员信息行
 * Single Participant Row
 *
 * @module features/training/components/ParticipantRow
 * @description 从 ParticipantForm 提取的单人份表单字段渲染，
 *              消除 participants.map 内的重复 JSX（D4-1 拆分）。
 */
import { useLocale } from "@/core/i18n";
import type { TrainingParticipant } from "../api";

interface ParticipantRowProps {
  participant: TrainingParticipant;
  index: number;
  onChange: (index: number, field: keyof TrainingParticipant, value: string | null) => void;
}

export function ParticipantRow({ participant, index, onChange }: ParticipantRowProps) {
  const { t } = useLocale();
  const inputCls = "w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent";
  const labelCls = "block text-xs font-medium text-slate-600 mb-0.5";

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1.5">
        {t("tlParticipantHeader", { index: String(index + 1) })}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <label className={labelCls}>{t("tlParticipantNameLabel")} <span className="text-red-500">*</span></label>
          <input type="text" value={participant.full_name}
            onChange={(e) => onChange(index, "full_name", e.target.value)}
            className={inputCls} placeholder={t("tlParticipantNamePlaceholder")} required />
        </div>
        <div>
          <label className={labelCls}>{t("tlParticipantGenderLabel")}</label>
          <select value={participant.gender || ""}
            onChange={(e) => onChange(index, "gender", e.target.value || null)} className={inputCls}>
            <option value="">{t("tlParticipantGenderSelect")}</option>
            <option value="male">{t("tlParticipantGenderMale")}</option>
            <option value="female">{t("tlParticipantGenderFemale")}</option>
            <option value="other">{t("tlParticipantGenderOther")}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("tlParticipantPhoneLabel")} <span className="text-red-500">*</span></label>
          <input type="tel" value={participant.phone || ""}
            onChange={(e) => onChange(index, "phone", e.target.value || null)}
            className={inputCls} placeholder={t("tlParticipantPhonePlaceholder")} required />
        </div>
        <div>
          <label className={labelCls}>{t("tlParticipantCompanyLabel")}</label>
          <input type="text" value={participant.company_name || ""}
            onChange={(e) => onChange(index, "company_name", e.target.value || null)}
            className={inputCls} placeholder={t("tlParticipantCompanyPlaceholder")} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>{t("tlParticipantPositionLabel")}</label>
          <input type="text" value={participant.position || ""}
            onChange={(e) => onChange(index, "position", e.target.value || null)}
            className={inputCls} placeholder={t("tlParticipantPositionPlaceholder")} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>{t("tlParticipantEmailLabel")}</label>
          <input type="email" value={participant.email || ""}
            onChange={(e) => onChange(index, "email", e.target.value || null)}
            className={inputCls} placeholder={t("tlParticipantEmailPlaceholder")} />
        </div>
      </div>
    </div>
  );
}
