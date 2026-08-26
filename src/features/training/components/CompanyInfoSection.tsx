/**
 * 公司/企业信息收集区块
 * Company Information Section
 *
 * @module features/training/components/CompanyInfoSection
 * @description 可复用的公司信息表单区块，包含行业三级联动、资质证书多选等。
 *              用于 TrainingRegisterForm 和 TrainingPaymentModal 阶段一。
 */

import { useEffect, useState } from "react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Input, Select } from "@/shared/ui";
import { fetchCertifications, fetchIndustries, fetchSubIndustries } from "../api";
import type { DictionaryItem } from "../api";

export interface CompanyInfoData {
  company_name: string;
  industry_id: string;
  industry_level2_id: string;
  industry_level3_id: string;
  main_product: string;
  export_experience: string;
  certification: string[];
  other_certification: string;
  contact_name: string;
  position: string;
  telephone: string;
  email: string;
  remark: string;
}

export interface CompanyInfoSectionProps {
  value: CompanyInfoData;
  onChange: (data: CompanyInfoData) => void;
}

const EXPORT_EXPERIENCE_OPTIONS = ["3年以下", "3~5年", "5~10年", "10年以上"];

export default function CompanyInfoSection({ value, onChange }: CompanyInfoSectionProps) {
  const { t, locale } = useLocale();
  const [certifications, setCertifications] = useState<DictionaryItem[]>([]);
  const [level1Industries, setLevel1Industries] = useState<DictionaryItem[]>([]);
  const [level2Industries, setLevel2Industries] = useState<DictionaryItem[]>([]);
  const [level3Industries, setLevel3Industries] = useState<DictionaryItem[]>([]);

  // 加载资质证书和行业数据（统一走 training service；此前裸 fetch 无鉴权重试/无缓存）
  useEffect(() => {
    fetchCertifications()
      .then(data => setCertifications(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetchIndustries()
      .then(data => setLevel1Industries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // 二级行业联动
  // 注意：/api/unspsc/industries 服务端忽略 level/parent_id 参数（固定返回一级类目），
  // 此前 level=2&parent_id= 的裸 fetch 实际拿到的是一级列表（级联数据错误）；
  // 正确通道为 /api/unspsc/children?parent_id=。
  useEffect(() => {
    if (!value.industry_id) {
      setLevel2Industries([]);
      setLevel3Industries([]);
      return;
    }
    fetchSubIndustries(value.industry_id)
      .then(data => setLevel2Industries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [value.industry_id]);

  // 三级行业联动（同上，改用 children 端点）
  useEffect(() => {
    if (!value.industry_level2_id) {
      setLevel3Industries([]);
      return;
    }
    fetchSubIndustries(value.industry_level2_id)
      .then(data => setLevel3Industries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [value.industry_level2_id]);

  const handleChange = (field: keyof CompanyInfoData, val: string | string[]) => {
    onChange({ ...value, [field]: val });
  };

  const toggleCertification = (cert: string) => {
    const has = value.certification.includes(cert);
    handleChange(
      "certification",
      has
        ? value.certification.filter((c) => c !== cert)
        : [...value.certification, cert],
    );
  };

  const labelOf = (item: DictionaryItem) =>
    `${item.code || ""}${item.code ? " - " : ""}${pickLocale(locale, item.title_zh || item.title_en || item.name, item.title_en || item.title_zh || item.name || "Unnamed")}`;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">
        {t("tlCompanyInfoTitle")}
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormCompanyName")} <span className="text-rose-500">*</span></span>
          <Input
            name="company_name"
            value={value.company_name}
            onChange={(e) => handleChange("company_name", e.target.value)}
            placeholder={pickLocale(locale, "如：浙江某医疗器械有限公司", "e.g. Zhejiang Medical Devices Co.")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel1Industry")}</span>
          <Select name="industry_id" value={value.industry_id} onChange={(e) => handleChange("industry_id", e.target.value)}>
            <option value="">{t("trainingFormSelectLevel1")}</option>
            {level1Industries.map((item) => (
              <option key={item.id} value={item.id}>{labelOf(item)}</option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel2Industry")}</span>
          <Select name="industry_level2_id" value={value.industry_level2_id} onChange={(e) => handleChange("industry_level2_id", e.target.value)} disabled={!level2Industries.length}>
            <option value="">{t("trainingFormSelectLevel2")}</option>
            {level2Industries.map((item) => (
              <option key={item.id} value={item.id}>{labelOf(item)}</option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel3Industry")}</span>
          <Select name="industry_level3_id" value={value.industry_level3_id} onChange={(e) => handleChange("industry_level3_id", e.target.value)} disabled={!level3Industries.length}>
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
            value={value.main_product}
            onChange={(e) => handleChange("main_product", e.target.value)}
            placeholder={pickLocale(locale, "如：医用耗材与器械", "e.g. Medical consumables")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormExportExperience")}</span>
          <Select name="export_experience" value={value.export_experience} onChange={(e) => handleChange("export_experience", e.target.value)}>
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
            const active = value.certification.includes(name);
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
          value={value.other_certification}
          onChange={(e) => handleChange("other_certification", e.target.value)}
          placeholder={t("trainingFormOtherCertPlaceholder")}
          className="mt-3"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormContactName")} <span className="text-rose-500">*</span></span>
          <Input
            name="contact_name"
            value={value.contact_name}
            onChange={(e) => handleChange("contact_name", e.target.value)}
            placeholder={pickLocale(locale, "联系人姓名", "Contact name")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPosition")}</span>
          <Input
            name="position"
            value={value.position}
            onChange={(e) => handleChange("position", e.target.value)}
            placeholder={pickLocale(locale, "如：采购经理", "e.g. Procurement Manager")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPhone")} <span className="text-rose-500">*</span></span>
          <Input
            name="telephone"
            value={value.telephone}
            onChange={(e) => handleChange("telephone", e.target.value)}
            placeholder={pickLocale(locale, "手机号码", "Phone number")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormEmail")}</span>
          <Input
            name="email"
            value={value.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder={pickLocale(locale, "邮箱地址", "Email address")}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormRemark")}</span>
        <textarea
          name="remark"
          value={value.remark}
          onChange={(e) => handleChange("remark", e.target.value)}
          rows={3}
          placeholder={t("trainingFormRemarkPlaceholder")}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none"
        />
      </label>
    </div>
  );
}

CompanyInfoSection.displayName = "CompanyInfoSection";
