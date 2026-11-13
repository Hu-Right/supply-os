/**
 * 企业信息 + 学员信息收集区块
 *
 * @module features/training/components/CompanyInfoSection
 * @description 2026-11-13 定稿的报名字段（用户清单）：
 *                企业：企业名称、主营产品、出口贸易经验、持有资质证书、备注
 *                学员：姓名、性别、电话、职位
 *                另加：参训期次（报名必选，决定排期与通知）
 *              删掉的：行业三级联动（68% 填充且层级混乱）、邮箱（用户清单未列）。
 *              企业画像的正式归宿是供应商档案与能力档案，不在报名表单重复收集。
 */

import { useEffect, useState } from "react";
import { useLocale, pickLocale } from "@/core/i18n";
import { ChipToggleGroup, Input, Select, Textarea } from "@/shared/ui";
import {
  fetchCertifications, fetchLandingData,
  type CertificationRefItem, type LandingSchedule,
} from "../api";
import { formatScheduleDate } from "@/shared/utils/format";

export interface CompanyInfoData {
  // 企业
  company_name: string;
  main_product: string;
  export_experience: string;
  certification: string[];
  other_certification: string;
  remark: string;
  /** 邮箱：发票与通知发送 */
  email: string;
  // 学员本人
  full_name: string;
  gender: string;
  phone: string;
  position: string;
  // 期次（仅报名表单展示；支付弹窗有独立的期次选择器）
  schedule_id: number | null;
}

export interface CompanyInfoSectionProps {
  value: CompanyInfoData;
  onChange: (data: CompanyInfoData) => void;
  /** 是否展示期次选择：仅报名表单需要，默认不展示 */
  showSchedule?: boolean;
  /** 是否展示学员本人四项：报名表单需要（独立弹窗里没有其他学员表单）；
   *  支付弹窗不需要——那里由 ParticipantForm 统一收每位学员，再收一遍就重复了 */
  showStudent?: boolean;
}

const EXPORT_EXPERIENCE_OPTIONS = ["3年以下", "3~5年", "5~10年", "10年以上"];

export default function CompanyInfoSection({ value, onChange, showSchedule = false, showStudent = true }: CompanyInfoSectionProps) {
  const { t, locale } = useLocale();
  const [certifications, setCertifications] = useState<CertificationRefItem[]>([]);
  const [schedules, setSchedules] = useState<LandingSchedule[]>([]);

  // 加载资质证书与期次；失败时下拉保持空选项，用户仍可手填证书
  useEffect(() => {
    fetchCertifications()
      .then(data => setCertifications(Array.isArray(data) ? data : []))
      .catch((e) => { console.warn("[CompanyInfo] 资质证书加载失败:", e); setCertifications([]); });

    if (showSchedule) {
      fetchLandingData()
        .then(d => setSchedules((d.schedules ?? []).filter(s => s.status !== "closed")))
        .catch((e) => { console.warn("[CompanyInfo] 期次加载失败:", e); setSchedules([]); });
    }
  }, [showSchedule]);

  const handleChange = (field: keyof CompanyInfoData, val: string | string[] | number | null) => {
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

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">
        {t("tlCompanyInfoTitle")}
      </h3>

      {showSchedule && (
        <label htmlFor="company-info-schedule" className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormSchedule")}</span>
          <Select
            id="company-info-schedule"
            value={value.schedule_id == null ? "" : String(value.schedule_id)}
            onChange={(e) => handleChange("schedule_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("trainingFormSchedulePlaceholder")}</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {`${t("tlSchPeriodNo").replace("{n}", String(s.periodNumber))} · ${s.city} · ${formatScheduleDate(s.startDate, locale)}`}
              </option>
            ))}
          </Select>
        </label>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label htmlFor="company-info-company-name" className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormCompanyName")}</span>
          <Input
            id="company-info-company-name"
            name="company_name"
            value={value.company_name}
            onChange={(e) => handleChange("company_name", e.target.value)}
            placeholder={pickLocale(locale, "如：浙江某医疗器械有限公司", "e.g. Zhejiang Medical Devices Co.")}
          />
        </label>

        <label htmlFor="company-info-main-product" className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormMainProduct")}</span>
          <Input
            id="company-info-main-product"
            name="main_product"
            value={value.main_product}
            onChange={(e) => handleChange("main_product", e.target.value)}
            placeholder={pickLocale(locale, "如：医用耗材与器械", "e.g. Medical consumables")}
          />
        </label>

        <label htmlFor="company-info-export-exp" className="block">
          <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormExportExperience")}</span>
          <Select
            id="company-info-export-exp"
            name="export_experience"
            value={value.export_experience}
            onChange={(e) => handleChange("export_experience", e.target.value)}
          >
            <option value="">{t("trainingFormSelectExport")}</option>
            {EXPORT_EXPERIENCE_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </Select>
        </label>
      </div>

      <section>
        <p className="mb-2 text-xs font-extrabold text-slate-700">{t("trainingFormCertifications")}</p>
        <ChipToggleGroup
          className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          selected={value.certification}
          onToggle={toggleCertification}
          items={certifications.map((item) => {
            // name 列 NOT NULL；空串（脏行）才回退到 id
            const name = item.name || String(item.id);
            return { value: name, label: name };
          })}
        />
        <Input
          name="other_certification"
          value={value.other_certification}
          onChange={(e) => handleChange("other_certification", e.target.value)}
          placeholder={t("trainingFormOtherCertPlaceholder")}
          aria-label={t("trainingFormOtherCertPlaceholder")}
          className="mt-3"
        />
      </section>

      <label htmlFor="company-info-remark" className="block">
        <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormRemark")}</span>
        <Textarea
          id="company-info-remark"
          name="remark"
          value={value.remark}
          onChange={(e) => handleChange("remark", e.target.value)}
          rows={2}
          placeholder={t("trainingFormRemarkPlaceholder")}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none"
        />
      </label>

      <label htmlFor="company-info-email" className="block">
        <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormEmail")}</span>
        <Input
          id="company-info-email"
          name="email"
          type="email"
          value={value.email}
          onChange={(e) => handleChange("email", e.target.value)}
          placeholder={pickLocale(locale, "用于接收发票与开课通知", "For invoices and class notices")}
        />
      </label>

      {showStudent && (
      <div className="border-t border-slate-200 pt-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label htmlFor="company-info-contact-name" className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormContactName")}</span>
            <Input
              id="company-info-contact-name"
              name="full_name"
              value={value.full_name}
              onChange={(e) => handleChange("full_name", e.target.value)}
              placeholder={pickLocale(locale, "参训学员姓名", "Attendee name")}
            />
          </label>

          <label htmlFor="company-info-gender" className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("tlParticipantGenderLabel")}</span>
            <Select
              id="company-info-gender"
              name="gender"
              value={value.gender}
              onChange={(e) => handleChange("gender", e.target.value)}
            >
              <option value="">{t("tlParticipantGenderSelect")}</option>
              <option value="male">{t("tlParticipantGenderMale")}</option>
              <option value="female">{t("tlParticipantGenderFemale")}</option>
            </Select>
          </label>

          <label htmlFor="company-info-phone" className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPhone")}</span>
            <Input
              id="company-info-phone"
              name="phone"
              value={value.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder={pickLocale(locale, "请输入手机号", "Enter phone number")}
            />
          </label>

          <label htmlFor="company-info-position" className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPosition")}</span>
            <Input
              id="company-info-position"
              name="position"
              value={value.position}
              onChange={(e) => handleChange("position", e.target.value)}
              placeholder={pickLocale(locale, "如：采购经理", "e.g. Procurement Manager")}
            />
          </label>
        </div>
      </div>
      )}
    </div>
  );
}
