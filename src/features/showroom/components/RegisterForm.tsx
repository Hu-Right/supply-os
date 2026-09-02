/**
 * 展厅注册表单组件
 * Showroom Register Form Component
 *
 * @module features/showroom/components/RegisterForm
 * @description 展厅注册表单弹窗，使用 FormModal 外壳消除样板代码。
 *              规范化非标准 Tailwind 类名（slate-205/550/750、teal-650、emerald-650）。
 */

import { useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { FormModal, Button, Input, Select } from "@/shared/ui";
import type { ExhibitionHall } from "@/types";
import { submitShowroomRegister, type ShowroomRegisterForm } from "../api";
import { emitAppEvent } from "@/core/events";

export interface RegisterFormProps {
  selectedShowroom: ExhibitionHall | null;
  onClose: () => void;
  onSuccess: () => void;
}

const INITIAL_FORM = {
  companyName: "",
  country: "China",
  city: "",
  contactPerson: "",
  contactMethod: "",
  email: "",
  industry: "机械 (Machinery)",
  mainProducts: "",
  hasIntlProcurement: false,
  notes: "",
};

export function RegisterForm({ selectedShowroom, onClose, onSuccess }: RegisterFormProps) {
  const { t, locale } = useLocale();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArr: string[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        filesArr.push(e.dataTransfer.files[i].name);
      }
      setUploadedFiles((prev) => [...prev, ...filesArr]);
    }
  };
  const triggerInputFileClick = () => {
    const names = ["Enterprise_Profile_EN.pdf", "ISO9001_Declaration.png", "Product_Specification_Dossier.docx"];
    const randomName = names[Math.floor(Math.random() * names.length)];
    setUploadedFiles((prev) => [...prev, randomName]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName || !form.contactPerson || !form.contactMethod) return;

    setLoading(true);
    try {
      const submitData: ShowroomRegisterForm = {
        ...form,
        country: form.country === "China" ? "中国" : form.country,
        notes: `[申请海外展厅: ${selectedShowroom ? pickLocale(locale, selectedShowroom.nameZh, selectedShowroom.nameEn) : "通用展厅"}] ${form.notes}. 模拟附件: ${uploadedFiles.join(", ") || "无"}`,
      };
      await submitShowroomRegister(submitData);
      setSubmitted(true);
      emitAppEvent("supply-os:crm-refresh");
      window.setTimeout(() => onSuccess(), 3000);
    } catch (err) {
      // 静默吞错会让用户以为没点上而反复提交（审查 F53），给出可见错误态
      console.error(err);
      setSubmitError(t("formSubmitFailed"));
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "mb-1 block text-xs font-extrabold text-slate-700";

  return (
    <FormModal
      open
      onClose={onClose}
      className="max-w-2xl"
      headerClassName="bg-gradient-to-r from-slate-950 to-transparent"
      title={
        selectedShowroom
          ? t("showroomApplyTitle", {
              name: pickLocale(locale, selectedShowroom.nameZh, selectedShowroom.nameEn),
            })
          : t("showroomApplyDefault")
      }
      subtitle={t("showroomFormSubtitle")}
      submitted={submitted}
      successView={
        <div className="space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <CheckCircle2 className="h-8 w-8 text-teal-600" />
          </div>
          <h4 className="text-base font-bold text-slate-800">{t("formSuccess")}</h4>
          <p className="text-xs text-slate-500">{t("showroomFormDemoNote")}</p>
        </div>
      }
      bodyClassName="max-h-[60vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <p className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-600">
            {submitError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>{t("companyName")} *</label>
            <Input
              type="text"
              placeholder={t("showroomCompanyPlaceholder")}
              value={form.companyName}
              onChange={(e) => handleChange("companyName", e.target.value)}
              className="text-xs"
              required
            />
          </div>
          <div>
            <label className={labelClass}>{t("contactPerson")} *</label>
            <Input
              type="text"
              placeholder={t("showroomContactPlaceholder")}
              value={form.contactPerson}
              onChange={(e) => handleChange("contactPerson", e.target.value)}
              className="text-xs"
              required
            />
          </div>
          <div>
            <label className={labelClass}>{t("formContactMethod")}</label>
            <Input
              type="text"
              placeholder={t("showroomPhonePlaceholder")}
              value={form.contactMethod}
              onChange={(e) => handleChange("contactMethod", e.target.value)}
              className="text-xs"
              required
            />
          </div>
          <div>
            <label className={labelClass}>{t("contactEmail")}</label>
            <Input
              type="email"
              placeholder={t("showroomEmailPlaceholder")}
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="text-xs"
            />
          </div>
          <div>
            <label className={labelClass}>{t("location")} *</label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={form.country}
                onChange={(e) => handleChange("country", e.target.value)}
                className="px-2 py-1.5"
              >
                <option value="China">{t("showroomCountryChina")}</option>
                <option value="Germany">{t("showroomCountryGermany")}</option>
                <option value="UAE">{t("showroomCountryUAE")}</option>
                <option value="Kenya">{t("showroomCountryKenya")}</option>
              </Select>
              <Input
                type="text"
                placeholder={t("showroomCityPlaceholder")}
                value={form.city}
                onChange={(e) => handleChange("city", e.target.value)}
                className="px-2 py-1.5 text-xs"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>{t("showroomIndustryLabel")} *</label>
            <Select
              value={form.industry}
              onChange={(e) => handleChange("industry", e.target.value)}
              className="text-xs"
            >
              <option value="机械 (Machinery)">{t("showroomIndustryMachinery")}</option>
              <option value="医疗 (Medical)">{t("showroomIndustryMedical")}</option>
              <option value="电子 (Electronics)">{t("showroomIndustryElectronics")}</option>
              <option value="建材 (Construction)">{t("showroomIndustryConstruction")}</option>
            </Select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t("formMainProductsGroup")}</label>
          <Input
            type="text"
            value={form.mainProducts}
            onChange={(e) => handleChange("mainProducts", e.target.value)}
            placeholder={t("mainProductsPlaceholder")}
            className="text-xs"
            required
          />
        </div>

        <div className="flex items-center space-x-2 rounded border border-slate-200 bg-slate-50 p-2.5">
          <input
            type="checkbox"
            id="hasIntlProcurement"
            checked={form.hasIntlProcurement}
            onChange={(e) => handleChange("hasIntlProcurement", e.target.checked)}
            className="h-4 w-4 rounded text-teal-600"
          />
          <label
            htmlFor="hasIntlProcurement"
            className="cursor-pointer select-none text-xs font-bold text-slate-700"
          >
            {t("showroomUngmCheckbox")}
          </label>
        </div>

        <div>
          <label className={labelClass}>{t("qualificationFile")}</label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerInputFileClick}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-all ${
              isDragging
                ? "border-teal-500 bg-teal-50/50"
                : "border-slate-300 bg-slate-50/20 hover:border-slate-400"
            }`}
          >
            <FileText className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-xs font-semibold text-slate-600">{t("uploadPlaceholder")}</p>
            <p className="mt-0.5 text-2xs text-slate-400">{t("uploadFileHint")}</p>

            {uploadedFiles.length > 0 && (
              <div className="mt-3 max-h-24 space-y-1.5 overflow-y-auto border-t border-slate-200 pt-2.5 text-start">
                {uploadedFiles.map((fn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  >
                    <span className="truncate font-mono text-3xs text-slate-700">{fn}</span>
                    <span className="text-2xs font-bold text-emerald-600">
                      {t("uploadMockSuccess")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>{t("formSpecialRequests")}</label>
          <textarea
            value={form.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            rows={2}
            placeholder={t("showroomNotesPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
          />
        </div>

        <div className="text-3xs text-slate-400">
          {t("formSubmitAgreement")}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="dark" loading={loading}>
            {t("submitRequestBtn")}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}

RegisterForm.displayName = "RegisterForm";
