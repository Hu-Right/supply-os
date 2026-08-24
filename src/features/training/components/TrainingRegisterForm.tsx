/**
 * 研修班报名表单弹窗
 * Training Registration Form Modal
 *
 * @module features/training/components/TrainingRegisterForm
 * @description 由原 TrainingPage 改造而来的弹窗内嵌报名表单。
 *              去掉外层 layout，仅保留 form，包裹在 Modal 中。
 *              表单逻辑复用 useTrainingForm，提交成功后回调 onSubmitSuccess 联动支付弹窗。
 */

import { useEffect, useRef } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Input, Select, Modal } from "@/shared/ui";
import { useTrainingForm } from "../hooks/useTrainingForm";
import type { DictionaryItem } from "../api";

export interface TrainingRegisterFormProps {
  /** 关闭回调 */
  onClose: () => void;
  /** 报名成功回调（携带 registrationId，供联动支付弹窗） */
  onSubmitSuccess?: (registrationId: number | null) => void;
}

export default function TrainingRegisterForm({ onClose, onSubmitSuccess }: TrainingRegisterFormProps) {
  const { t, locale } = useLocale();
  const {
    form,
    submitted,
    loading,
    error,
    registrationId,
    certifications,
    level1Industries,
    level2Industries,
    level3Industries,
    EXPORT_EXPERIENCE_OPTIONS,
    handleChange,
    toggleCertification,
    handleSubmit,
  } = useTrainingForm();

  // 报名成功 → 回调联动支付弹窗（仅触发一次）
  const notified = useRef(false);
  useEffect(() => {
    if (submitted && !notified.current) {
      notified.current = true;
      onSubmitSuccess?.(registrationId);
    }
    if (!submitted) notified.current = false;
  }, [submitted, registrationId, onSubmitSuccess]);

  const labelOf = (item: DictionaryItem) =>
    `${item.code || ""}${item.code ? " - " : ""}${pickLocale(locale, item.title_zh || item.title_en || item.name, item.title_en || item.title_zh || item.name || "Unnamed")}`;

  return (
    <Modal open onClose={onClose} title={t("tlRegisterModalTitle")}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
      {submitted && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-bold text-teal-800">{t("trainingSubmittedTitle")}</p>
            <p className="text-xs text-teal-600">{t("trainingSubmittedDesc")}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormCompanyName")}</span>
            <Input
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              placeholder={pickLocale(locale, "如：浙江某医疗器械有限公司", "e.g. Zhejiang Medical Devices Co.")}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel1Industry")}</span>
            <Select name="industry_id" value={form.industry_id} onChange={handleChange}>
              <option value="">{t("trainingFormSelectLevel1")}</option>
              {level1Industries.map((item) => (
                <option key={item.id} value={item.id}>{labelOf(item)}</option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel2Industry")}</span>
            <Select name="industry_level2_id" value={form.industry_level2_id} onChange={handleChange} disabled={!level2Industries.length}>
              <option value="">{t("trainingFormSelectLevel2")}</option>
              {level2Industries.map((item) => (
                <option key={item.id} value={item.id}>{labelOf(item)}</option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel3Industry")}</span>
            <Select name="industry_level3_id" value={form.industry_level3_id} onChange={handleChange} disabled={!level3Industries.length}>
              <option value="">{t("trainingFormSelectLevel3")}</option>
              {level3Industries.map((item) => (
                <option key={item.id} value={item.id}>{labelOf(item)}</option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormMainProduct")}</span>
            <Input
              name="main_product"
              value={form.main_product}
              onChange={handleChange}
              placeholder={pickLocale(locale, "如：医用耗材与器械", "e.g. Medical consumables")}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormExportExperience")}</span>
            <Select name="export_experience" value={form.export_experience} onChange={handleChange}>
              <option value="">{t("trainingFormSelectExport")}</option>
              {EXPORT_EXPERIENCE_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </label>
        </div>

        <section>
          <p className="mb-2 text-xs font-extrabold text-slate-700">{t("trainingFormCertifications")}</p>
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {certifications.map((item) => {
              const name = item.name || item.title_zh || item.title_en || String(item.id);
              const active = form.certification.includes(name);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleCertification(name)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${active ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <Input
            name="other_certification"
            value={form.other_certification}
            onChange={handleChange}
            placeholder={t("trainingFormOtherCertPlaceholder")}
            className="mt-3"
          />
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormContactName")}</span>
            <Input name="contact_name" value={form.contact_name} onChange={handleChange} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPosition")}</span>
            <Input name="position" value={form.position} onChange={handleChange} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPhone")}</span>
            <Input name="telephone" value={form.telephone} onChange={handleChange} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormEmail")}</span>
            <Input name="email" value={form.email} onChange={handleChange} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormRemark")}</span>
          <textarea
            name="remark"
            value={form.remark}
            onChange={handleChange}
            rows={3}
            placeholder={t("trainingFormRemarkPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {loading ? t("trainingSubmitting") : t("trainingSubmitBtn")}
          </button>
        </div>
      </form>
      </div>
    </Modal>
  );
}

TrainingRegisterForm.displayName = "TrainingRegisterForm";
