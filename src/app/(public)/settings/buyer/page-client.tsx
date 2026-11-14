"use client";

/**
 * /settings/buyer — 采购方身份认证（七步流程第 1 步，全案 F01）
 * @module app/(public)/settings/buyer/page-client
 * @description 一个账号一个采购主体：表单 PUT /api/procurement/buyer 幂等 upsert；
 *              执照上传走既有执照字节入库通道。已核验主体改关键身份字段自动回落
 *              pending 重新核验。未认证可发布草稿/提交，不可正式发布（流程第 6 步闸）。
 *              2026-11-14 体验重构：七步流程条 + 状态横幅 + 醒目执照拖拽上传 + 分区表单。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { fetchMyBuyerWithVerifications, saveBuyer, type BuyerInfo, type BuyerVerification } from "@/features/procurement-demand/api";
import { FlowStepper } from "@/features/procurement-demand/FlowStepper";
import { FileDropzone } from "@/features/procurement-demand/FileDropzone";

export default function PageClient() {
  const { t } = useLocale();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [verifications, setVerifications] = useState<BuyerVerification[]>([]);
  const [riskFlags, setRiskFlags] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<Array<{ buyerId: number; orgName: string; matchedField: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageCls, setMessageCls] = useState("bg-secondary-50 text-secondary-700");
  const [form, setForm] = useState({
    orgName: "", orgType: "private", buyerRole: "end_buyer",
    country: "", address: "", regNo: "", taxNo: "",
    website: "", officialEmail: "", officialPhone: "",
    leaderName: "", leaderTitle: "", leaderPhone: "", leaderEmail: "",
    deliverCountry: "", deliverCity: "", fundSource: "own", budgetStatus: "approved", externalRules: "",
    authContactName: "", authContactPhone: "", authContactEmail: "", procurementExperience: "",
  });
  const [licenseFile, setLicenseFile] = useState<File[]>([]);
  const [licenseError, setLicenseError] = useState("");
  const [authDocFile, setAuthDocFile] = useState<File[]>([]);
  const [authDocError, setAuthDocError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { buyer: b, verifications: vs, duplicates: dups, riskFlags: risks } = await fetchMyBuyerWithVerifications();
      setVerifications(vs);
      setDuplicates(dups);
      setRiskFlags(risks);
      if (b) {
        setBuyer(b);
        setForm((p) => ({
          ...p,
          orgName: b.orgName, orgType: b.orgType || "private", buyerRole: b.buyerRole || "end_buyer",
          country: b.country, address: b.address, regNo: b.regNo, taxNo: b.taxNo,
          website: b.website, officialEmail: b.officialEmail, officialPhone: b.officialPhone,
          leaderName: b.leaderName, leaderTitle: b.leaderTitle, leaderPhone: b.leaderPhone, leaderEmail: b.leaderEmail,
          deliverCountry: b.deliverCountry, deliverCity: b.deliverCity,
          fundSource: b.fundSource || "own", budgetStatus: b.budgetStatus || "approved", externalRules: b.externalRules,
          authContactName: b.authContactName || "", authContactPhone: b.authContactPhone || "", authContactEmail: b.authContactEmail || "",
          procurementExperience: b.procurementExperience || "",
        }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSave = async () => {
    if (!form.orgName.trim()) {
      setMessage(t("pc_borgname") + " / " + t("pc_err_required"));
      setMessageCls("bg-red-50 text-red-700");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      let licenseUrl: string | null = null;
      let licenseHash: string | null = null;
      if (licenseFile.length > 0 && licenseFile[0]) {
        const fd = new FormData();
        fd.append("file", licenseFile[0]);
        const r = await api<{ url: string; fileHash: string }>("/api/procurement/buyer/license-upload", {
          method: "POST",
          body: fd,
        });
        licenseUrl = r.url;
        licenseHash = r.fileHash;
      }
      let agentAuthKey: string | null = null;
      let agentAuthHash: string | null = null;
      if (authDocFile.length > 0 && authDocFile[0]) {
        const fd = new FormData();
        fd.append("file", authDocFile[0]);
        const r = await api<{ url: string; fileHash: string; filename: string }>(
          "/api/procurement/buyer/auth-doc",
          { method: "POST", body: fd },
        );
        agentAuthKey = r.filename;
        agentAuthHash = r.fileHash;
      }
      await saveBuyer({
        ...form,
        ...(licenseUrl ? { license_file_key: licenseUrl.replace("/api/user/enterprise/license/", "") } : {}),
        ...(licenseHash ? { license_file_hash: licenseHash } : {}),
        ...(agentAuthKey ? { agentAuthFileKey: agentAuthKey } : {}),
        ...(agentAuthHash ? { agentAuthFileHash: agentAuthHash } : {}),
      });
      setMessage(t("pc_bsave_ok"));
      setMessageCls("bg-teal-50 text-teal-800");
      setLicenseFile([]);
      setAuthDocFile([]);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setMessage((err as Error).message || t("pc_bsave_fail"));
      setMessageCls("bg-red-50 text-red-700");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none";
  const labelCls = "text-sm font-semibold text-secondary-700 block";
  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const orgTypeOptions = ["government", "international_org", "ngo", "state_owned", "private", "trader", "epc", "agent"];
  const roleOptions = ["end_buyer", "authorized_agent", "general_contractor", "intermediary"];

  const statusBanner = buyer
    ? buyer.status === "verified"
      ? { cls: "bg-teal-50 border-teal-200 text-teal-800", text: t("pc_bflow_verified_done") }
      : buyer.status === "need_info"
        ? { cls: "bg-amber-50 border-amber-200 text-amber-800", text: `${t("pc_bflow_need_info")}${buyer.verifyNote ? `：${buyer.verifyNote}` : ""}` }
        : buyer.status === "restricted"
          ? { cls: "bg-red-50 border-red-200 text-red-700", text: t("pc_bflow_restricted") }
          : { cls: "bg-amber-50 border-amber-200 text-amber-800", text: t("pc_bflow_pending") }
    : { cls: "bg-blue-50 border-blue-200 text-blue-800", text: t("pc_bflow_new") };

  if (loading) return <div className="py-10 text-center text-sm text-secondary-400">…</div>;

  const sectionTitle = (s: string) => (
    <div className="col-span-full mt-2 border-b border-secondary-100 pb-1 text-xs font-bold uppercase tracking-wide text-secondary-400">{s}</div>
  );

  return (
    <div className="space-y-4">
      {/* 流程位置：第 1 步 */}
      <div className="rounded-2xl border border-secondary-200 bg-white p-4 shadow-xs">
        <FlowStepper current={1} />
      </div>

      {/* 状态横幅 */}
      <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${statusBanner.cls}`}>{statusBanner.text}</div>

      {/* 核验记录（F05）：每次核验的维度、结论、核验人与意见 */}
      {verifications.length > 0 && (
        <div className="rounded-2xl border border-secondary-200 bg-white p-4 shadow-xs">
          <div className="text-sm font-bold text-secondary-900">{t("pc_bverify_history")}</div>
          <div className="mt-2 grid gap-2">
            {verifications.map((v) => {
              const cls =
                v.result === "pass" ? "bg-teal-100 text-teal-800"
                : v.result === "need_info" ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-700";
              return (
                <div key={v.id} className="flex items-start justify-between gap-3 rounded-lg border border-secondary-100 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-secondary-700">{t(`pc_bvk_${v.kind}`)}</span>
                    {v.note && <span className="ml-2 text-secondary-500">{v.note}</span>}
                    <span className="ml-2 text-secondary-400">{v.reviewer}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${cls}`}>{t(`pc_verify_${v.result}`)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-lg font-extrabold text-secondary-900">{t("pc_bpage_title")}</h1>
          {buyer?.buyerNo && (
            <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-semibold text-secondary-600">
              {t("pc_buyerNo")}：{buyer.buyerNo}
            </span>
          )}
        </div>
        {buyer?.verifyNote && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("pc_bverify_note")}: {buyer.verifyNote}</div>
        )}

        {/* F01 自动查重与风险提示（自检参考，不替代云境核验） */}
        {duplicates.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="font-semibold">{t("pc_dedup_title")}</div>
            <p className="mt-0.5">{t("pc_dedup_hint")}</p>
            <ul className="mt-1 list-disc pl-4">
              {duplicates.map((d) => (
                <li key={d.buyerId}>{d.orgName}（{t(`pc_dedup_${d.matchedField}`)}）</li>
              ))}
            </ul>
          </div>
        )}
        {riskFlags.length > 0 && (
          <div className="mb-3 rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-700">
            <div className="font-semibold">{t("pc_risk_title")}</div>
            <ul className="mt-1 list-disc pl-4">
              {riskFlags.map((code) => <li key={code}>{t(`pc_risk_${code}`)}</li>)}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {sectionTitle(t("pc_bsec_identity"))}
          <label className={labelCls}>{t("pc_borgname")} *<input value={form.orgName} onChange={(e) => f("orgName", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_borgtype")}
            <select value={form.orgType} onChange={(e) => f("orgType", e.target.value)} className={inputCls}>
              {orgTypeOptions.map((v) => <option key={v} value={v}>{t(`pc_borgtype_${v}`)}</option>)}
            </select>
          </label>
          <label className={labelCls}>{t("pc_brole")}
            <select value={form.buyerRole} onChange={(e) => f("buyerRole", e.target.value)} className={inputCls}>
              {roleOptions.map((v) => <option key={v} value={v}>{t(`pc_brole_${v}`)}</option>)}
            </select>
          </label>
          <label className={labelCls}>{t("pc_bcountry")}<input value={form.country} onChange={(e) => f("country", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_baddress")}<input value={form.address} onChange={(e) => f("address", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bregno")}<input value={form.regNo} onChange={(e) => f("regNo", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_btaxno")}<input value={form.taxNo} onChange={(e) => f("taxNo", e.target.value)} className={inputCls} /></label>

          {sectionTitle(t("pc_bsec_license"))}
          <div className="col-span-full">
            <div className="mb-2 text-xs font-semibold text-secondary-600">{t("pc_blicense")} <span className="text-teal-600">({t("pc_blicense_why")})</span></div>
            <FileDropzone
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              maxSizeBytes={10 * 1024 * 1024}
              files={licenseFile}
              onFilesChange={setLicenseFile}
              onReject={(r) => setLicenseError(r === "size" ? t("pc_fz_err_size") : t("pc_fz_err_type"))}
              existingFiles={buyer?.licenseFileUrl && !licenseFile.length ? [{ name: t("pc_blicense_existing"), url: buyer.licenseFileUrl }] : []}
            />
            {licenseError && <div className="mt-2 text-xs text-red-600">{licenseError}</div>}
          </div>

          {sectionTitle(t("pc_bsec_contact"))}
          <label className={labelCls}>{t("pc_bwebsite")}<input value={form.website} onChange={(e) => f("website", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bemail")}<input value={form.officialEmail} onChange={(e) => f("officialEmail", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bphone")}<input value={form.officialPhone} onChange={(e) => f("officialPhone", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bleader")}<input value={form.leaderName} onChange={(e) => f("leaderName", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bleadertitle")}<input value={form.leaderTitle} onChange={(e) => f("leaderTitle", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bleaderphone")}<input value={form.leaderPhone} onChange={(e) => f("leaderPhone", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bleaderemail")}<input value={form.leaderEmail} onChange={(e) => f("leaderEmail", e.target.value)} className={inputCls} /></label>

          {sectionTitle(t("pc_bsec_auth"))}
          <label className={labelCls}>{t("pc_bauthcontact_name")}<input value={form.authContactName} onChange={(e) => f("authContactName", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bauthcontact_phone")}<input value={form.authContactPhone} onChange={(e) => f("authContactPhone", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bauthcontact_email")}<input value={form.authContactEmail} onChange={(e) => f("authContactEmail", e.target.value)} className={inputCls} /></label>
          <div className="col-span-full">
            <div className="mb-2 text-xs font-semibold text-secondary-600">{t("pc_bauthdoc")} <span className="text-secondary-400">({t("pc_bauthdoc_hint")})</span></div>
            <FileDropzone
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              maxSizeBytes={10 * 1024 * 1024}
              files={authDocFile}
              onFilesChange={setAuthDocFile}
              onReject={(r) => setAuthDocError(r === "size" ? t("pc_fz_err_size") : t("pc_fz_err_type"))}
              existingFiles={buyer?.agentAuthFileUrl && !authDocFile.length ? [{ name: t("pc_blicense_existing"), url: buyer.agentAuthFileUrl }] : []}
            />
            {authDocError && <div className="mt-2 text-xs text-red-600">{authDocError}</div>}
          </div>

          {sectionTitle(t("pc_bsec_region"))}
          <label className={labelCls}>{t("pc_bdelivercountry")}<input value={form.deliverCountry} onChange={(e) => f("deliverCountry", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bdelivercity")}<input value={form.deliverCity} onChange={(e) => f("deliverCity", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bfundsource")}
            <select value={form.fundSource} onChange={(e) => f("fundSource", e.target.value)} className={inputCls}>
              {["own", "government_budget", "loan", "donation", "project_special"].map((v) => (
                <option key={v} value={v}>{t(`pc_bfund_${v}`)}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>{t("pc_bbudgetstatus")}
            <select value={form.budgetStatus} onChange={(e) => f("budgetStatus", e.target.value)} className={inputCls}>
              {["approved", "partial", "pending", "applying"].map((v) => (
                <option key={v} value={v}>{t(`pc_budget_${v}`)}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>{t("pc_bexternalrules")}<input value={form.externalRules} onChange={(e) => f("externalRules", e.target.value)} className={inputCls} /></label>
          <label className={`${labelCls} sm:col-span-2`}>{t("pc_bexperience")}
            <textarea value={form.procurementExperience} onChange={(e) => f("procurementExperience", e.target.value)} rows={2} className={inputCls} />
          </label>
        </div>

        {message && <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${messageCls}`}>{message}</div>}
        <div className="mt-5 flex items-center gap-3">
          <button type="button" disabled={saving} onClick={onSave} className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50">
            {saving ? "…" : t("pc_bsave")}
          </button>
          <span className="text-xs text-secondary-400">{t("pc_bpage_hint")}</span>
        </div>
      </div>
    </div>
  );
}
