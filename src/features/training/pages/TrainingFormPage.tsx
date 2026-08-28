/**
 * 资质诊断独立表单页（手机扫码直达）
 * Qualification Diagnosis Standalone Form Page
 *
 * @module features/training/pages/TrainingFormPage
 * @description 独立全屏表单页，供手机扫码直接访问填写。
 *              复用 CompanyInfoSection 组件（行业联动/认证选择），
 *              去掉 Modal 外壳，移动端优先单列布局。
 *              提交后数据写入 crm_training_registrations 表（与研修班共用）。
 */

import { useState } from "react";
import { CheckCircle2, Send, ArrowLeft } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import CompanyInfoSection, { type CompanyInfoData } from "../components/CompanyInfoSection";
import { NAVY, GREEN, GREEN_HOVER, BG_LIGHT } from "../components/landing-ui";
import { submitTrainingRegister } from "../api";
import { ApiError } from "@/core/http";

const INITIAL_FORM: CompanyInfoData = {
  company_name: "",
  industry_id: "",
  industry_level2_id: "",
  industry_level3_id: "",
  main_product: "",
  export_experience: "",
  certification: [],
  other_certification: "",
  contact_name: "",
  position: "",
  telephone: "",
  email: "",
  remark: "",
};

export default function TrainingFormPage() {
  const { t, locale } = useLocale();
  const [form, setForm] = useState<CompanyInfoData>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.company_name || !form.contact_name || !form.telephone) {
      setError(t("trainingRegisterValidationError"));
      return;
    }

    let certificationStr = form.certification.join("\n");
    if (form.other_certification.trim()) {
      certificationStr += "\n" + form.other_certification.trim();
    }

    // 取最细粒度行业
    const selectedIndustryId = form.industry_level3_id || form.industry_level2_id || form.industry_id;

    setLoading(true);
    try {
      await submitTrainingRegister({
        company_name: form.company_name,
        industry_id: selectedIndustryId ? parseInt(selectedIndustryId) : null,
        main_product: form.main_product,
        export_experience: form.export_experience,
        certification: certificationStr,
        contact_name: form.contact_name,
        position: form.position,
        telephone: form.telephone,
        email: form.email,
        remark: form.remark,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("formError"));
    } finally {
      setLoading(false);
    }
  };

  // ── 提交成功页 ──
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BG_LIGHT }}>
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#0AA09B]/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-[#0AA09B]" />
          </div>
          <h1 className="text-xl font-black text-[#0A2A55] mb-3">
            {pickLocale(locale, "诊断问卷已提交", "Diagnosis Submitted")}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            {pickLocale(locale, "添加客服微信，发送「诊断报告+企业名称」即可获取专属诊断报告", "Add our customer service on WeChat and send 'Diagnosis Report' to get your exclusive report")}
          </p>
          <div className="flex justify-center mb-6">
            <img
              src="/wechat-service-qr.png"
              alt="WeChat QR"
              className="w-44 h-44 rounded-xl border-2 border-white shadow-md"
            />
          </div>
          <p className="text-xs text-slate-400 mb-8">
            {pickLocale(locale, "微信扫码添加客服", "Scan QR code to add customer service on WeChat")}
          </p>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setForm(INITIAL_FORM); }}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white"
            style={{ background: GREEN }}
            onMouseEnter={(e) => (e.currentTarget.style.background = GREEN_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = GREEN)}
          >
            <Send className="w-4 h-4" />
            {pickLocale(locale, "重新填写", "Fill Again")}
          </button>
        </div>
      </div>
    );
  }

  // ── 表单页 ──
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      {/* 顶部栏 */}
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3" style={{ background: NAVY }}>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-white/80 hover:text-white cursor-pointer"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-black text-white">
          {pickLocale(locale, "企业全球采购机会诊断", "Enterprise Global Procurement Opportunity Diagnosis")}
        </h1>
      </header>

      {/* 说明区 */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <p className="text-sm text-slate-600 leading-relaxed">
            {pickLocale(
              locale,
              "填写以下信息完成企业全球采购机会诊断，我们将根据您的企业情况评估全球采购入驻资格。",
              "Fill in the information below to complete the global procurement opportunity diagnosis. We will assess your global procurement eligibility based on your company profile.",
            )}
          </p>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="px-4 pb-10">
        <div className="max-w-lg mx-auto space-y-5">
          {/* 错误提示 */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
              {error}
            </div>
          )}

          {/* 公司信息表单区块（复用现有组件） */}
          <div className="rounded-2xl border border-[#E5EBF3] bg-white p-5 shadow-sm">
            <CompanyInfoSection value={form} onChange={setForm} />
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-black text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: GREEN }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = GREEN_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = GREEN; }}
          >
            <Send className="w-5 h-5" />
            {loading
              ? pickLocale(locale, "提交中...", "Submitting...")
              : pickLocale(locale, "提交资质诊断", "Submit Diagnosis")}
          </button>

          <p className="text-center text-xs text-slate-400 pb-4">
            {pickLocale(locale, "提交即表示您同意我们收集并使用上述信息", "By submitting you agree to our data collection policy")}
          </p>
        </div>
      </form>
    </div>
  );
}

TrainingFormPage.displayName = "TrainingFormPage";
