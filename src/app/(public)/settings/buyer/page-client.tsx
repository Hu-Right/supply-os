"use client";

/**
 * /settings/buyer — 采购方身份认证（七步流程第 1 步，全案 F01）
 * @module app/(public)/settings/buyer/page-client
 * @description 一个账号一个采购主体：表单 PUT /api/procurement/buyer 幂等 upsert；
 *              执照上传走既有执照字节入库通道。已核验主体改关键身份字段自动回落
 *              pending 重新核验。未认证可发布草稿/提交，不可正式发布（流程第 6 步闸）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { fetchMyBuyer, saveBuyer, type BuyerInfo } from "@/features/procurement-demand/api";

export default function PageClient() {
  const { t } = useLocale();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    orgName: "", orgType: "private", buyerRole: "end_buyer",
    country: "", address: "", regNo: "", taxNo: "",
    website: "", officialEmail: "", officialPhone: "",
    leaderName: "", leaderTitle: "", leaderPhone: "", leaderEmail: "",
    deliverCountry: "", deliverCity: "", fundSource: "own", budgetStatus: "approved", externalRules: "",
  });
  const licenseRef = useRef<HTMLInputElement>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchMyBuyer();
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
        }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      let licenseUrl: string | null = null;
      let licenseHash: string | null = null;
      if (licenseFile) {
        const fd = new FormData();
        fd.append("file", licenseFile);
        const r = await api<{ url: string; fileHash: string }>("/api/procurement/buyer/license-upload", {
          method: "POST",
          body: fd,
        });
        licenseUrl = r.url;
        licenseHash = r.fileHash;
      }
      await saveBuyer({
        ...form,
        ...(licenseUrl ? { license_file_key: licenseUrl.replace("/api/user/enterprise/license/", "") } : {}),
        ...(licenseHash ? { license_file_hash: licenseHash } : {}),
      });
      setMessage(t("pc_bsave_ok"));
      setLicenseFile(null);
      if (licenseRef.current) licenseRef.current.value = "";
      await load();
    } catch (err) {
      setMessage((err as Error).message || t("pc_bsave_fail"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm";
  const labelCls = "text-sm font-semibold text-secondary-700 block";
  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const orgTypeOptions = ["government", "international_org", "ngo", "state_owned", "private", "trader", "epc", "agent"];
  const roleOptions = ["end_buyer", "authorized_agent", "general_contractor", "intermediary"];

  if (loading) return <div className="py-10 text-center text-sm text-secondary-400">…</div>;

  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-secondary-900">{t("pc_bpage_title")}</h1>
        {buyer && (
          <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-semibold text-secondary-600">
            {t(`pc_buyer_status_${buyer.status}`)}
          </span>
        )}
      </div>
      {buyer?.verifyNote && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("pc_bverify_note")}: {buyer.verifyNote}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className={labelCls}>{t("pc_bregno")}<input value={form.regNo} onChange={(e) => f("regNo", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_btaxno")}<input value={form.taxNo} onChange={(e) => f("taxNo", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_bwebsite")}<input value={form.website} onChange={(e) => f("website", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_bemail")}<input value={form.officialEmail} onChange={(e) => f("officialEmail", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_bphone")}<input value={form.officialPhone} onChange={(e) => f("officialPhone", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_bleader")}<input value={form.leaderName} onChange={(e) => f("leaderName", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_bleaderphone")}<input value={form.leaderPhone} onChange={(e) => f("leaderPhone", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_bdelivercountry")}<input value={form.deliverCountry} onChange={(e) => f("deliverCountry", e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("pc_blicense")}
          <input ref={licenseRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm" />
          {buyer?.licenseFileUrl && (
            <a className="mt-1 block text-xs text-teal-600 underline" href={buyer.licenseFileUrl} target="_blank" rel="noreferrer">{t("pc_blicense_view")}</a>
          )}
        </label>
      </div>

      {message && <div className="mt-4 rounded-lg bg-secondary-50 px-3 py-2 text-xs text-secondary-700">{message}</div>}
      <button type="button" disabled={saving} onClick={onSave} className="mt-5 rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "…" : t("pc_bsave")}
      </button>
      <p className="mt-3 text-xs text-secondary-400">{t("pc_bpage_hint")}</p>
    </div>
  );
}
