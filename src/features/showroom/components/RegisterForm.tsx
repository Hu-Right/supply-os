/**
 * 展厅注册表单组件
 * Showroom Register Form Component
 *
 * @module features/showroom/components/RegisterForm
 * @description 展厅注册表单弹窗
 *              Showroom registration form modal
 */

import { useState } from "react";
import { CheckCircle2, FileText, X } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useScrollLock } from "@/shared/ui";
import type { ExhibitionHall } from "@/types";
import { submitShowroomRegister, type ShowroomRegisterForm } from "../api";

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
  has国际公共采购Participation: false,
  notes: "",
};

export function RegisterForm({ selectedShowroom, onClose, onSuccess }: RegisterFormProps) {
  const { t, locale } = useLocale();
  // 弹窗打开期间锁定背景滚动
  useScrollLock();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // 模拟附件上传：拖拽记录真实文件名，点击随机生成示例文件名（对齐远端）
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };
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
      // 对齐原版 fetchData()：通知 CRM 模块刷新线索池
      window.dispatchEvent(new CustomEvent("supply-os:crm-refresh"));
      // 对齐远端：成功页停留 3 秒后自动关闭
      window.setTimeout(() => onSuccess(), 3000);
    } catch (err) {
      // 对齐原版：提交失败记录日志（不静默吞掉）
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-slate-900 bg-gradient-to-r from-slate-950 to-transparent p-4 text-white">
          <div>
            <h3 className="text-base font-extrabold">
              {selectedShowroom
                ? t("showroomApplyTitle", {
                    name: pickLocale(locale, selectedShowroom.nameZh, selectedShowroom.nameEn),
                  })
                : t("showroomApplyDefault")}
            </h3>
            <p className="text-[10px] text-slate-400">{t("showroomFormSubtitle")}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-650">
              <CheckCircle2 className="h-8 w-8 text-teal-600" />
            </div>
            <h4 className="text-base font-bold text-slate-800">{t("formSuccess")}</h4>
            <p className="text-xs text-slate-500">{t("showroomFormDemoNote")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  {t("companyName")} *
                </label>
                <input
                  type="text"
                  placeholder={t("showroomCompanyPlaceholder")}
                  value={form.companyName}
                  onChange={(e) => handleChange("companyName", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  {t("contactPerson")} *
                </label>
                <input
                  type="text"
                  placeholder={t("showroomContactPlaceholder")}
                  value={form.contactPerson}
                  onChange={(e) => handleChange("contactPerson", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  {t("formContactMethod")}
                </label>
                <input
                  type="text"
                  placeholder={t("showroomPhonePlaceholder")}
                  value={form.contactMethod}
                  onChange={(e) => handleChange("contactMethod", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  {t("contactEmail")}
                </label>
                <input
                  type="email"
                  placeholder="e.g., manager@corp.com"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  {t("location")} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.country}
                    onChange={(e) => handleChange("country", e.target.value)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                  >
                    <option value="China">中国 (China)</option>
                    <option value="Germany">德国 (Germany)</option>
                    <option value="UAE">阿联酋 (UAE)</option>
                    <option value="Kenya">肯尼亚 (Kenya)</option>
                  </select>
                  <input
                    type="text"
                    placeholder={t("showroomCityPlaceholder")}
                    value={form.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  主营行业 *
                </label>
                <select
                  value={form.industry}
                  onChange={(e) => handleChange("industry", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                >
                  <option value="机械 (Machinery)">机械 (Machinery)</option>
                  <option value="医疗 (Medical)">医疗 (Medical)</option>
                  <option value="电子 (Electronics)">电子 (Electronics)</option>
                  <option value="建材 (Construction)">建材 (Construction)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-extrabold text-slate-700">
                {t("formMainProductsGroup")}
              </label>
              <input
                type="text"
                value={form.mainProducts}
                onChange={(e) => handleChange("mainProducts", e.target.value)}
                placeholder={t("mainProductsPlaceholder")}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex items-center space-x-2 rounded border border-slate-150 bg-slate-50 p-2.5">
              <input
                type="checkbox"
                id="has国际公共采购C"
                checked={form.has国际公共采购Participation}
                onChange={(e) => handleChange("has国际公共采购Participation", e.target.checked)}
                className="h-4 w-4 rounded text-teal-600"
              />
              <label
                htmlFor="has国际公共采购C"
                className="cursor-pointer select-none text-xs font-bold text-slate-700"
              >
                {t("showroomUngmCheckbox")}
              </label>
            </div>

            {/* 模拟附件上传区（拖拽 / 点击） */}
            <div>
              <label className="mb-1 block text-xs font-extrabold text-slate-700">
                {t("qualificationFile")}
              </label>
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
                <p className="mt-0.5 text-[10px] text-slate-400">{t("uploadFileHint")}</p>

                {uploadedFiles.length > 0 && (
                  <div className="mt-3 max-h-24 space-y-1.5 overflow-y-auto border-t border-slate-200 pt-2.5 text-start">
                    {uploadedFiles.map((fn, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1 text-xs"
                      >
                        <span className="truncate font-mono text-[11px] text-slate-750">{fn}</span>
                        <span className="text-[10px] font-bold text-emerald-650">
                          {t("uploadMockSuccess")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-extrabold text-slate-700">
                {t("formSpecialRequests")}
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={2}
                placeholder={t("showroomNotesPlaceholder")}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div className="text-[11px] text-slate-400">
              {t("formSubmitAgreement")}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-lg border border-slate-205 px-4 py-2 text-xs text-slate-550 hover:bg-slate-50"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-teal-650"
              >
                {t("submitRequestBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

RegisterForm.displayName = "RegisterForm";
