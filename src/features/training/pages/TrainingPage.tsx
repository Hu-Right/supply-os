/**
 * 培训注册页面
 * Training Registration Page
 *
 * @module features/training/pages/TrainingPage
 * @description 培训注册页面入口，包含表单和行业联动
 *              Training registration page entry with form and industry cascading
 */

import { CheckCircle2, GraduationCap, Send } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Input, Select, Button, ChipToggleGroup, Textarea } from "@/shared/ui";
import { useTrainingForm } from "../hooks/useTrainingForm";
import type { DictionaryItem } from "@/core/unspsc/types";

export default function TrainingPage() {
  const { t, locale } = useLocale();
  const {
    form,
    submitted,
    loading,
    error,
    certifications,
    level1Industries,
    level2Industries,
    level3Industries,
    EXPORT_EXPERIENCE_OPTIONS,
    handleChange,
    toggleCertification,
    handleSubmit,
  } = useTrainingForm();

  const labelOf = (item: DictionaryItem) =>
    `${item.code || ""}${item.code ? " - " : ""}${pickLocale(locale, item.title_zh || item.title_en || item.name, item.title_en || item.title_zh || item.name || "Unnamed")}`;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-7 w-7 text-amber-300" />
          <div>
            <h2 className="text-xl font-extrabold">{t("trainingPageTitle")}</h2>
            <p className="mt-1 text-xs text-slate-400">{t("trainingPageSubtitle")}</p>
          </div>
        </div>
      </section>

      {submitted && (
        <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-bold text-teal-800">{t("trainingSubmittedTitle")}</p>
            <p className="text-xs text-teal-600">{t("trainingSubmittedDesc")}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs md:p-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormCompanyName")}
            </span>
            <Input
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              placeholder={pickLocale(locale, "如：浙江某医疗器械有限公司", "e.g. Zhejiang Medical Devices Co.")}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormLevel1Industry")}
            </span>
            <Select
              name="industry_id"
              value={form.industry_id}
              onChange={handleChange}
            >
              <option value="">{t("trainingFormSelectLevel1")}</option>
              {level1Industries.map((item) => (
                <option key={item.id} value={item.id}>
                  {labelOf(item)}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormLevel2Industry")}
            </span>
            <Select
              name="industry_level2_id"
              value={form.industry_level2_id}
              onChange={handleChange}
              disabled={!level2Industries.length}
            >
              <option value="">{t("trainingFormSelectLevel2")}</option>
              {level2Industries.map((item) => (
                <option key={item.id} value={item.id}>
                  {labelOf(item)}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormLevel3Industry")}
            </span>
            <Select
              name="industry_level3_id"
              value={form.industry_level3_id}
              onChange={handleChange}
              disabled={!level3Industries.length}
            >
              <option value="">{t("trainingFormSelectLevel3")}</option>
              {level3Industries.map((item) => (
                <option key={item.id} value={item.id}>
                  {labelOf(item)}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormMainProduct")}
            </span>
            <Input
              name="main_product"
              value={form.main_product}
              onChange={handleChange}
              placeholder={pickLocale(locale, "如：医用耗材与器械", "e.g. Medical consumables")}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormExportExperience")}
            </span>
            <Select
              name="export_experience"
              value={form.export_experience}
              onChange={handleChange}
            >
              <option value="">{t("trainingFormSelectExport")}</option>
              {EXPORT_EXPERIENCE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <section>
          <p className="mb-2 text-xs font-extrabold text-slate-700">
            {t("trainingFormCertifications")}
          </p>
          <ChipToggleGroup
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            selected={form.certification}
            onToggle={toggleCertification}
            items={certifications.map((item) => {
              const name = item.name || item.title_zh || item.title_en || String(item.id);
              return { value: name, label: name };
            })}
          />
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
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormContactName")}
            </span>
            <Input
              name="contact_name"
              value={form.contact_name}
              onChange={handleChange}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormPosition")}
            </span>
            <Input
              name="position"
              value={form.position}
              onChange={handleChange}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormPhone")}
            </span>
            <Input
              name="telephone"
              value={form.telephone}
              onChange={handleChange}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">
              {t("trainingFormEmail")}
            </span>
            <Input
              name="email"
              value={form.email}
              onChange={handleChange}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">
            {t("trainingFormRemark")}
          </span>
          <Textarea
            name="remark"
            value={form.remark}
            onChange={handleChange}
            rows={3}
            placeholder={t("trainingFormRemarkPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none"
          />
        </label>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="accent"
            size="lg"
            loading={loading}
            className="rounded-xl text-sm font-black"
          >
            <Send className="h-4 w-4" />
            {loading ? t("trainingSubmitting") : t("trainingSubmitBtn")}
          </Button>
        </div>
      </form>
    </div>
  );
}

TrainingPage.displayName = "TrainingPage";
