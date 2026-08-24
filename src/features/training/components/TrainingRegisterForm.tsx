/**
 * 研修班报名表单弹窗
 * Training Registration Form Modal
 *
 * @module features/training/components/TrainingRegisterForm
 * @description 由原 TrainingPage 改造而来的弹窗内嵌报名表单。
 *              去掉外层 layout，仅保留 form，包裹在 Modal 中。
 *              表单逻辑复用 useTrainingForm，提交成功后回调 onSubmitSuccess 联动支付弹窗。
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import CompanyInfoSection, { type CompanyInfoData } from "./CompanyInfoSection";

export interface TrainingRegisterFormProps {
  /** 关闭回调 */
  onClose: () => void;
  /** 报名成功回调（携带 registrationId，供联动支付弹窗） */
  onSubmitSuccess?: (registrationId: number | null) => void;
}

const INITIAL_COMPANY_INFO: CompanyInfoData = {
  company_name: "",
  industry_id: "",
  industry_level2_id: "",
  industry_level3_id: "",
  main_product: "",
  export_experience: "",
  certification: [],
  other_certification: "",
  remark: "",
};

export default function TrainingRegisterForm({ onClose, onSubmitSuccess }: TrainingRegisterFormProps) {
  const { t } = useLocale();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoData>(INITIAL_COMPANY_INFO);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registrationId, setRegistrationId] = useState<number | null>(null);

  // 报名成功 → 回调联动支付弹窗（仅触发一次）
  const notified = useRef(false);
  useEffect(() => {
    if (submitted && !notified.current) {
      notified.current = true;
      onSubmitSuccess?.(registrationId);
    }
    if (!submitted) notified.current = false;
  }, [submitted, registrationId, onSubmitSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!companyInfo.company_name) {
      setError(t("trainingRegisterValidationError"));
      return;
    }

    let certificationStr = companyInfo.certification.join("\n");
    if (companyInfo.other_certification.trim()) {
      certificationStr += "\n" + companyInfo.other_certification.trim();
    }

    setLoading(true);
    try {
      const res = await fetch("/api/training/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyInfo.company_name,
          industry_id: companyInfo.industry_id ? parseInt(companyInfo.industry_id) : null,
          main_product: companyInfo.main_product,
          export_experience: companyInfo.export_experience,
          certification: certificationStr,
          remark: companyInfo.remark,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRegistrationId(data.registration_id ?? null);
        setSubmitted(true);
        setTimeout(() => onClose(), 2500);
      } else {
        const data = await res.json();
        setError(data.error || t("formError"));
      }
    } catch (err) {
      setError(t("formError"));
    } finally {
      setLoading(false);
    }
  };

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
          <CompanyInfoSection value={companyInfo} onChange={setCompanyInfo} />

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
