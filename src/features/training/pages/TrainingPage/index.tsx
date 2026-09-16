/**
 * 国际公共采购实战研修班 — 拆分后主入口
 * Training Landing Page — Module 11 Design Mockup
 *
 * @module features/training/pages/TrainingPage
 * @description 完整落地页：深色页头+统计墙+课程模块+讲师+课程安排+学员反馈+报名权益+报名表单。
 */
import {
  Send, CheckCircle2, Calendar,
  Layers, Globe, FileText, Users,
} from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Input, Select, Button, ChipToggleGroup, Textarea } from "@/shared/ui";
import { useTrainingForm } from "../../hooks/useTrainingForm";
import type { DictionaryItem } from "@/core/unspsc/types";

import { CourseModules } from "./CourseModules";
import { Instructors } from "./Instructors";
import { InfoColumns } from "./InfoColumns";

export default function TrainingPage() {
  const { t, locale } = useLocale();
  const {
    form, submitted, loading, error, certifications,
    level1Industries, level2Industries, level3Industries, EXPORT_EXPERIENCE_OPTIONS,
    handleChange, toggleCertification, handleSubmit,
  } = useTrainingForm();

  const labelOf = (item: DictionaryItem) =>
    `${item.code || ""}${item.code ? " - " : ""}${pickLocale(locale, item.title_zh || item.title_en || item.name, item.title_en || item.title_zh || item.name || "Unnamed")}`;

  return (
    <div className="space-y-6">
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-10 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
            国际公共采购实战研修班
          </h1>
          <p className="text-lg md:text-xl font-bold text-teal-400 mb-3">
            看见订单 · 懂规则 · 辅助投标 · 轻陪跑执行
          </p>
          <p className="text-slate-300 text-sm max-w-2xl mb-5">
            面向外贸企业、制造工厂、贸易公司与出海服务机构，系统学习联合国采购与国际公共采购的底层规则、获单路径、投标提报与实操方法。
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            <button className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-xl font-bold text-sm transition-colors">
              立即报名
            </button>
            <button className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-3 rounded-xl font-bold text-sm transition-colors">
              咨询顾问
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-300 mb-4">
            {["每月开课", "杭州线下", "真实案例", "实战导向"].map((tag) => (
              <span key={tag} className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" /> {tag}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            <span className="text-slate-300 font-bold">适合人群：</span>
            外贸老板 / 业务负责人 / 投标专员 / 供应链负责人 / 想开拓国际公采的新团队
          </p>
        </div>
      </section>

      {/* ══ 统计墙 ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: "12", label: "核心模块", icon: Layers },
          { value: "2000+", label: "全球订单信息沉淀", icon: Globe },
          { value: "50+", label: "实战案例拆解", icon: FileText },
          { value: "100+", label: "企业咨询与陪跑经验", icon: Users },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5 text-center shadow-sm">
              <Icon className="w-8 h-8 text-teal-600 mx-auto mb-2" />
              <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* ══ 课程模块 + 讲师 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CourseModules />
        <Instructors />
      </div>

      {/* ══ 课程安排 + 学员反馈 + 报名权益 ═══ */}
      <InfoColumns />

      {/* ══ 报名表单（原有功能保留） ═══ */}
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs md:p-6">
        <h3 className="text-base font-extrabold text-slate-900 mb-2">报名信息</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormCompanyName")}</span>
            <Input name="company_name" value={form.company_name} onChange={handleChange} placeholder="如：浙江某医疗器械有限公司" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel1Industry")}</span>
            <Select name="industry_id" value={form.industry_id} onChange={handleChange}>
              <option value="">{t("trainingFormSelectLevel1")}</option>
              {level1Industries.map((item) => (<option key={item.id} value={item.id}>{labelOf(item)}</option>))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel2Industry")}</span>
            <Select name="industry_level2_id" value={form.industry_level2_id} onChange={handleChange} disabled={!level2Industries.length}>
              <option value="">{t("trainingFormSelectLevel2")}</option>
              {level2Industries.map((item) => (<option key={item.id} value={item.id}>{labelOf(item)}</option>))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormLevel3Industry")}</span>
            <Select name="industry_level3_id" value={form.industry_level3_id} onChange={handleChange} disabled={!level3Industries.length}>
              <option value="">{t("trainingFormSelectLevel3")}</option>
              {level3Industries.map((item) => (<option key={item.id} value={item.id}>{labelOf(item)}</option>))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormMainProduct")}</span>
            <Input name="main_product" value={form.main_product} onChange={handleChange} placeholder="如：医用耗材与器械" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormExportExperience")}</span>
            <Select name="export_experience" value={form.export_experience} onChange={handleChange}>
              <option value="">{t("trainingFormSelectExport")}</option>
              {EXPORT_EXPERIENCE_OPTIONS.map((item) => (<option key={item} value={item}>{item}</option>))}
            </Select>
          </label>
        </div>
        <section>
          <p className="mb-2 text-xs font-extrabold text-slate-700">{t("trainingFormCertifications")}</p>
          <ChipToggleGroup className="rounded-xl border border-slate-200 bg-slate-50 p-3" selected={form.certification} onToggle={toggleCertification} items={certifications.map((item) => ({ value: item.name || item.title_zh || item.title_en || String(item.id), label: item.name || item.title_zh || item.title_en || String(item.id) }))} />
          <Input name="other_certification" value={form.other_certification} onChange={handleChange} placeholder={t("trainingFormOtherCertPlaceholder")} className="mt-3" />
        </section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormContactName")}</span><Input name="contact_name" value={form.contact_name} onChange={handleChange} /></label>
          <label className="block"><span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPosition")}</span><Input name="position" value={form.position} onChange={handleChange} /></label>
          <label className="block"><span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormPhone")}</span><Input name="telephone" value={form.telephone} onChange={handleChange} /></label>
          <label className="block"><span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormEmail")}</span><Input name="email" value={form.email} onChange={handleChange} /></label>
        </div>
        <label className="block"><span className="mb-1 block text-xs font-extrabold text-slate-700">{t("trainingFormRemark")}</span><Textarea name="remark" value={form.remark} onChange={handleChange} rows={3} placeholder={t("trainingFormRemarkPlaceholder")} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none" /></label>
        <div className="flex justify-end">
          <Button type="submit" variant="accent" size="lg" loading={loading} className="rounded-xl text-sm font-black"><Send className="h-4 w-4" />{loading ? t("trainingSubmitting") : t("trainingSubmitBtn")}</Button>
        </div>
      </form>
    </div>
  );
}

TrainingPage.displayName = "TrainingPage";
