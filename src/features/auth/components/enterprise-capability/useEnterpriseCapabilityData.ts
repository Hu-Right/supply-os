/**
 * 企业能力档案 — 数据域 Hook（自 EnterpriseCapabilitySection.tsx 拆出）
 *
 * @module features/auth/components/enterprise-capability/useEnterpriseCapabilityData
 * @description 能力项 CRUD + 证据上传/删除/鉴权打开的全部状态与动作：
 *              load 拉档案、submitCapability/deleteCapability 走能力接口、
 *              submitEvidence/deleteEvidence/openEvidenceFile 走证据接口。
 *              两个域共用一份 profile/loading/error 与 load()（任一变更都整档重拉，
 *              与拆分前行为一致）；表单态也在此持有，视图组件只收 props 渲染。
 */
import { useCallback, useEffect, useState } from "react";
import { api, getAuthToken } from "@/core/http";
import { useLocale } from "@/core/i18n";
import type { CapabilityType, FieldValue, ProfileResponse } from "./shared";

export function useEnterpriseCapabilityData(enabled: boolean) {
  const { t } = useLocale();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capType, setCapType] = useState<CapabilityType>("certification");
  const [capName, setCapName] = useState("");
  const [fields, setFields] = useState<Record<string, FieldValue>>({ noExpiry: true });
  const [savingCap, setSavingCap] = useState(false);

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceCategory, setEvidenceCategory] = useState("cert");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceValidUntil, setEvidenceValidUntil] = useState("");
  const [evidenceNoExpiry, setEvidenceNoExpiry] = useState(true);
  const [savingEvidence, setSavingEvidence] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await api<ProfileResponse>("/api/user/enterprise/capabilities"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const setField = (key: string, value: FieldValue) => setFields((prev) => ({ ...prev, [key]: value }));
  /** 切换能力类型时整体重置字段态（原行为：setFields({ noExpiry: true })，非 merge） */
  const resetFields = () => setFields({ noExpiry: true });

  const buildCapabilityValue = (): Record<string, unknown> | null => {
    const f = fields;
    const str = (key: string) => (typeof f[key] === "string" ? String(f[key]).trim() : "");
    switch (capType) {
      case "certification": {
        const validUntil = str("validUntil");
        if (!f.noExpiry && !validUntil) {
          setError(t("capCertExpiryRequired"));
          return null;
        }
        return { code: str("code") || capName, issuer: str("issuer") || null, noExpiry: f.noExpiry === true, validUntil: f.noExpiry ? null : validUntil };
      }
      case "experience":
        return { count: str("count") === "" ? null : Number(str("count")), years: str("years") === "" ? null : Number(str("years")), similarScope: str("similarScope") };
      case "financial":
        return { metric: str("metric"), value: str("value") === "" ? null : Number(str("value")), year: str("year") === "" ? null : Number(str("year")) };
      case "personnel":
        return { role: str("role"), count: str("count") === "" ? null : Number(str("count")) };
      case "localization":
        return { country: str("country") || null, hasLocalOffice: f.hasLocalOffice === true, hasLocalAgent: f.hasLocalAgent === true, hasLocalTaxId: f.hasLocalTaxId === true };
      case "registration":
        return { platform: str("platform"), status: str("status") || "active" };
      case "technical":
        return { parameter: str("parameter"), value: str("value") === "" ? null : Number(str("value")), unit: str("unit") || null };
      default:
        return { text: str("text") };
    }
  };

  const submitCapability = async () => {
    setError(null);
    if (!capName.trim()) {
      setError(t("capNameRequired"));
      return;
    }
    const value = buildCapabilityValue();
    if (!value) return;
    setSavingCap(true);
    try {
      await api("/api/user/enterprise/capabilities", { method: "POST", body: { type: capType, name: capName.trim(), value } });
      setCapName("");
      setFields({ noExpiry: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capSaveFailed"));
    } finally {
      setSavingCap(false);
    }
  };

  const deleteCapability = async (id: number) => {
    setError(null);
    try {
      await api(`/api/user/enterprise/capabilities/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capDeleteFailed"));
    }
  };

  const submitEvidence = async () => {
    setError(null);
    if (!evidenceTitle.trim()) {
      setError(t("capEvidenceTitleRequired"));
      return;
    }
    if (evidenceCategory === "cert" && !evidenceNoExpiry && !evidenceValidUntil) {
      setError(t("capEvidenceExpiryRequired"));
      return;
    }
    const form = new FormData();
    form.append("category", evidenceCategory);
    form.append("title", evidenceTitle.trim());
    if (evidenceValidUntil) form.append("validUntil", evidenceValidUntil);
    form.append("noExpiry", evidenceNoExpiry ? "1" : "0");
    if (evidenceFile) form.append("file", evidenceFile);
    setSavingEvidence(true);
    try {
      await api("/api/user/enterprise/evidence", { method: "POST", body: form });
      setEvidenceTitle("");
      setEvidenceFile(null);
      setEvidenceValidUntil("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capUploadFailed"));
    } finally {
      setSavingEvidence(false);
    }
  };

  const deleteEvidence = async (id: number) => {
    setError(null);
    try {
      await api(`/api/user/enterprise/evidence/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capDeleteFailed"));
    }
  };

  /** 证据文件走鉴权路由：带 Bearer 拉 Blob 后新窗口打开（<a> 无法附加 Authorization） */
  const openEvidenceFile = async (url: string) => {
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(t("capFileOpenFailedStatus", { status: res.status }));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capFileOpenFailed"));
    }
  };

  return {
    profile, loading, error, load,
    capType, setCapType, capName, setCapName, fields, setField, resetFields, savingCap, submitCapability, deleteCapability,
    evidenceFile, setEvidenceFile, evidenceCategory, setEvidenceCategory, evidenceTitle, setEvidenceTitle,
    evidenceValidUntil, setEvidenceValidUntil, evidenceNoExpiry, setEvidenceNoExpiry, savingEvidence,
    submitEvidence, deleteEvidence, openEvidenceFile,
  };
}

export type EnterpriseCapabilityData = ReturnType<typeof useEnterpriseCapabilityData>;
