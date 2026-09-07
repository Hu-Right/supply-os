/**
 * 国际公共采购实战研修班 — 100% 还原设计图
 * Training Landing Page — Module 11 Design Mockup
 *
 * @module features/training/pages/TrainingPage
 * @description 完整落地页：深色页头+统计墙+课程模块+讲师+课程安排+学员反馈+报名权益+报名表单。
 */
import {
  GraduationCap, Send, CheckCircle2, Calendar, Clock, FileText, MapPin,
  BookOpen, Target, Layers, Shield, FileCheck, AlertTriangle, Handshake, Truck,
  Users, Award, Globe,
} from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Input, Select, Button, ChipToggleGroup, Textarea } from "@/shared/ui";
import { useTrainingForm } from "../hooks/useTrainingForm";
import type { DictionaryItem } from "@/core/unspsc/types";

/* ── 课程模块 8 项 ── */
const COURSE_MODULES = [
  { num: 1, icon: BookOpen, title: "平台规则", desc: "联合国及主要国际公采平台规则解读" },
  { num: 2, icon: Target, title: "商机筛选", desc: "需求分析与商机识别方法" },
  { num: 3, icon: Layers, title: "UNSPSC", desc: "分类体系与编码实操应用" },
  { num: 4, icon: Shield, title: "供应商资质", desc: "注册路径与资质文件准备" },
  { num: 5, icon: FileCheck, title: "投标文件", desc: "投标文件结构与撰写要点" },
  { num: 6, icon: AlertTriangle, title: "风险控制", desc: "合规要求与风险识别规避" },
  { num: 7, icon: Handshake, title: "商务谈判", desc: "谈判策略与价格条款处理" },
  { num: 8, icon: Truck, title: "中标后履约", desc: "合同执行、验收与持续合作管理" },
];

/* ── 讲师 4 位 ── */
const INSTRUCTORS = [
  { title: "联合国采购顾问", exp: "10年+ 联合国采购项目经验，熟悉UN流程与规则" },
  { title: "国际公采实战导师", exp: "15年+ 国际公采投标实战经验，擅长策略与落地" },
  { title: "投标拆标导师", exp: "精通标书拆解与评分逻辑，助力提升中标率" },
  { title: "本地履约顾问", exp: "多国本地履约与合规经验，保障合同执行落地" },
];

/* ── 报名权益 ── */
const ENROLLMENT_BENEFITS = [
  "课程资料：全套课件与学习手册",
  "模板清单：标书模板、清单与工具包",
  "课后答疑：60天内讲师答疑服务",
  "社群交流：学员社群，资源与经验分享",
  "报名后可预约顾问沟通：1对1需求诊断与方案建议",
];

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
        {/* 课程模块 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">1</span>
            课程模块
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {COURSE_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div key={mod.num} className="border border-slate-100 rounded-lg p-3 hover:border-teal-200 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xs font-bold text-teal-600">{mod.num}.</span>
                    <Icon className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-extrabold text-slate-900">{mod.title}</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">{mod.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 讲师阵容 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">2</span>
            讲师阵容
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {INSTRUCTORS.map((inst) => (
              <div key={inst.title} className="text-center border border-slate-100 rounded-lg p-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 mx-auto mb-2 flex items-center justify-center">
                  <Users className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-xs font-extrabold text-slate-900 mb-1">{inst.title}</p>
                <p className="text-2xs text-slate-500 leading-relaxed">{inst.exp}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 课程安排 + 学员反馈 + 报名权益 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 课程安排 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">3</span>
            课程安排
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Calendar, label: "开课频次", value: "每月1期，滚动开课" },
              { icon: Clock, label: "时长", value: "2天线下集中研修（16课时）" },
              { icon: FileText, label: "交付物", value: "课件+模板+清单+案例库+工具包" },
              { icon: MapPin, label: "形式", value: "杭州线下为主，提供线上回放" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label}>
                  <Icon className="w-5 h-5 text-teal-600 mb-1" />
                  <p className="text-2xs font-bold text-slate-500">{item.label}</p>
                  <p className="text-xs font-bold text-slate-800">{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 学员反馈/案例成果 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">4</span>
            学员反馈 / 案例成果
          </h3>
          <div className="space-y-3">
            {[
              "通过课程掌握了UN平台规则与投标方法，成功入驻UNGM平台。",
              "课程中的标书模板和拆标方法非常实用，3周内完成首套标书。",
              "在老师指导下锁定目标订单，已进入投标评估阶段。",
            ].map((fb, i) => (
              <div key={i} className="text-xs text-slate-600 border-l-2 border-teal-400 pl-3 py-1">
                "{fb}"
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "完成平台入驻", sub: "UNGM注册成功" },
              { label: "建立投标资料包", sub: "形成标准资料体系" },
              { label: "锁定目标订单", sub: "进入投标评估环节" },
            ].map((r) => (
              <div key={r.label}>
                <p className="text-xs font-extrabold text-teal-700">{r.label}</p>
                <p className="text-2xs text-slate-400">{r.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 报名权益（深色侧栏） */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white">
          <h3 className="text-base font-extrabold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" /> 报名权益
          </h3>
          <ul className="space-y-2.5 mb-5">
            {ENROLLMENT_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                {b}
              </li>
            ))}
          </ul>
          <button className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold text-sm transition-colors mb-2">
            立即报名
          </button>
          <button className="w-full bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-xl text-xs font-bold transition-colors">
            咨询顾问了解详情
          </button>
        </div>
      </div>

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
