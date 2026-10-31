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
  submitTrainingRegister, fetchCertifications, fetchIndustryFacets, fetchIndustryChildren,
  type TrainingRegisterForm, type CertificationRefItem,
} from "../api";
import type { IndustryTreeOption } from "@/types";

const EXPORT_EXPERIENCE_OPTIONS = ["3年以内", "3-5年", "5-10年", "10年以上"];

export interface TrainingFormState {
  company_name: string;
  /** 行业取 UGT-I 行业面节点码（最深已选层） */
  industry_code: string;
  industry_level2_code: string;
  industry_level3_code: string;
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
  industry_code: "",
  industry_level2_code: "",
  industry_level3_code: "",
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

  const [certifications, setCertifications] = useState<CertificationRefItem[]>([]);
  const [level1Industries, setLevel1Industries] = useState<IndustryTreeOption[]>([]);
  const [level2Industries, setLevel2Industries] = useState<IndustryTreeOption[]>([]);
  const [level3Industries, setLevel3Industries] = useState<IndustryTreeOption[]>([]);

  // 加载初始数据
  useEffect(() => {
    fetchCertifications()
      .then((items) => setCertifications(Array.isArray(items) ? items : []))
      .catch(() => setCertifications([]));

    fetchIndustryFacets()
      .then((items) => setLevel1Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel1Industries([]));
  }, []);

  // 行业联动：一级 → 二级
  useEffect(() => {
    if (!form.industry_code) {
      setLevel2Industries([]);
      setLevel3Industries([]);
      return;
    }
    fetchIndustryChildren(form.industry_code)
      .then((items) => setLevel2Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel2Industries([]));
    setForm((prev) => ({ ...prev, industry_level2_code: "", industry_level3_code: "" }));
  }, [form.industry_code]);

  // 行业联动：二级 → 三级
  useEffect(() => {
    if (!form.industry_level2_code) {
      setLevel3Industries([]);
      return;
    }
    fetchIndustryChildren(form.industry_level2_code)
      .then((items) => setLevel3Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel3Industries([]));
    setForm((prev) => ({ ...prev, industry_level3_code: "" }));
  }, [form.industry_level2_code]);

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

      if (!form.company_name || !form.industry_code || !form.contact_name || !form.telephone) {
        setError(t("trainingValidationError"));
        return;
      }

      const certification = [form.certification.join(", "), form.other_certification.trim()]
        .filter(Boolean)
        .join("\n");
      const selectedIndustryCode = form.industry_level3_code || form.industry_level2_code || form.industry_code || null;

      const submitData: TrainingRegisterForm = {
        company_name: form.company_name,
        industry_code: selectedIndustryCode,
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
