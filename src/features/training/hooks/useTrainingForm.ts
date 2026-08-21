/**
 * 培训注册表单 Hook
 * Training Registration Form Hook
 *
 * @module features/training/hooks/useTrainingForm
 * @description 管理培训注册表单状态、行业联动、提交逻辑
 *              Manage training registration form state, industry cascading, submit logic
 */

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/core/i18n";
import {
  fetchCertifications,
  fetchIndustries,
  fetchSubIndustries,
  submitTrainingRegister,
  type DictionaryItem,
  type TrainingRegisterForm,
} from "../api";

const EXPORT_EXPERIENCE_OPTIONS = ["3年以内", "3-5年", "5-10年", "10年以上"];

export interface TrainingFormState {
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

const INITIAL_FORM_STATE: TrainingFormState = {
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

export function useTrainingForm() {
  const { t } = useLocale();
  const [form, setForm] = useState<TrainingFormState>(INITIAL_FORM_STATE);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 报名成功后后端返回的自增 id，供落地页联动支付弹窗
  const [registrationId, setRegistrationId] = useState<number | null>(null);

  const [certifications, setCertifications] = useState<DictionaryItem[]>([]);
  const [level1Industries, setLevel1Industries] = useState<DictionaryItem[]>([]);
  const [level2Industries, setLevel2Industries] = useState<DictionaryItem[]>([]);
  const [level3Industries, setLevel3Industries] = useState<DictionaryItem[]>([]);

  // 加载初始数据
  useEffect(() => {
    fetchCertifications()
      .then((items) => setCertifications(Array.isArray(items) ? items : []))
      .catch(() => setCertifications([]));

    fetchIndustries()
      .then((items) => setLevel1Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel1Industries([]));
  }, []);

  // 行业联动：一级 → 二级
  useEffect(() => {
    if (!form.industry_id) {
      setLevel2Industries([]);
      setLevel3Industries([]);
      return;
    }
    fetchSubIndustries(form.industry_id)
      .then((items) => setLevel2Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel2Industries([]));
    setForm((prev) => ({ ...prev, industry_level2_id: "", industry_level3_id: "" }));
  }, [form.industry_id]);

  // 行业联动：二级 → 三级
  useEffect(() => {
    if (!form.industry_level2_id) {
      setLevel3Industries([]);
      return;
    }
    fetchSubIndustries(form.industry_level2_id)
      .then((items) => setLevel3Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel3Industries([]));
    setForm((prev) => ({ ...prev, industry_level3_id: "" }));
  }, [form.industry_level2_id]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      setForm((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const toggleCertification = useCallback((name: string) => {
    setForm((prev) => ({
      ...prev,
      certification: prev.certification.includes(name)
        ? prev.certification.filter((item) => item !== name)
        : [...prev.certification, name],
    }));
  }, []);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM_STATE);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");

      if (!form.company_name || !form.industry_id || !form.contact_name || !form.telephone) {
        setError(t("trainingValidationError"));
        return;
      }

      const certification = [form.certification.join(", "), form.other_certification.trim()]
        .filter(Boolean)
        .join("\n");
      const selectedIndustryId = Number(form.industry_level3_id || form.industry_level2_id || form.industry_id);

      const submitData: TrainingRegisterForm = {
        company_name: form.company_name,
        industry_id: selectedIndustryId,
        main_product: form.main_product,
        export_experience: form.export_experience,
        certification,
        contact_name: form.contact_name,
        position: form.position,
        telephone: form.telephone,
        email: form.email,
        remark: form.remark,
      };

      setLoading(true);
      try {
        const result = await submitTrainingRegister(submitData);
        setRegistrationId(result.id ?? null);
        setSubmitted(true);
        resetForm();
        setTimeout(() => setSubmitted(false), 4000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("formError");
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [form, t, resetForm]
  );

  return {
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
  };
}
