"use client";

/**
 * /settings/buyer — 采购方身份认证（七步流程第 1 步，全案 F01）
 * @module app/(public)/settings/buyer/page-client
 * @description 一个账号一个采购主体：表单 PUT /api/procurement/buyer 幂等 upsert；
 *              执照上传走既有执照字节入库通道。已核验主体改关键身份字段自动回落
 *              pending 重新核验。未认证可发布草稿/提交，不可正式发布（流程第 6 步闸）。
 *              2026-11-14 体验重构：七步流程条 + 状态横幅 + 醒目执照拖拽上传 + 分区表单。
 *              2026-11 四次调整：**核验历史不再在本页展示**——主体核验的结论、驳回原因
 *              统一走站内通知（铃铛 / /notifications / 详情页），认证页只保留"当前状态 +
 *              最近一次意见 + 表单"。留痕数据仍在 procurement_buyer_verifications（回调幂等
 *              与审计依赖它），只是不在用户端铺开。
 *              2026-11 三次重构（表单精简）：逐字段核对消费方后，24 项砍到 12 项。
 *              下线（库列保留、不再收集）：主体类型/注册地址/采购地区/资金来源/预算状态/采购经验；
 *              项目负责人 4 项合并进授权联系人（规则只读 auth_contact_name）。
 *              每个必填字段配一句"为什么需要"，避免被当成填问卷。
 *              2026-11 二次重构：把"当前态"与"留痕"彻底拆开——
 *                ① 顶部状态卡为唯一权威（状态 + 下一步 CTA + 等待时长 + 最近意见）；
 *                ② 核验留痕移到表单之后、默认收起，带时间与"当前有效"标记；
 *                ③ 核验人不再显示内部账号名（统一"云境核验"）；
 *                ④ 未知 kind/result 加兜底（t() 缺键返回空串，否则静默渲染空白）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { fetchMyBuyerWithVerifications, saveBuyer, type BuyerInfo } from "@/features/procurement-demand/api";
import { FlowStepper } from "@/features/procurement-demand/FlowStepper";
import { FileDropzone } from "@/features/procurement-demand/FileDropzone";
import { ChipToggleGroup, FieldHintTooltip, SearchableSelect } from "@/shared/ui";
import {
  EXTERNAL_RULE_GROUPS,
  EXTERNAL_RULE_NOTE_MAX,
  decodeExternalRules,
  encodeExternalRules,
  ruleLabelKey,
} from "@/shared/constants/external-procurement-rules";
import { missingBuyerFields } from "@/shared/constants/buyer-form";
import { countryName, countryOptions, guessCountryCode } from "@/shared/constants/countries";

export default function PageClient() {
  const { t, locale } = useLocale();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [riskFlags, setRiskFlags] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<Array<{ buyerId: number; orgName: string; matchedField: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageCls, setMessageCls] = useState("bg-secondary-50 text-secondary-700");
  // 只保留"有消费方"或"核验需要"的字段；下线字段不提交 = 保持库里原值（upsertBuyer 只写提交的键）
  const [form, setForm] = useState({
    orgName: "", buyerRole: "end_buyer",
    country: "", regNo: "", taxNo: "",
    website: "", officialEmail: "", officialPhone: "",
    externalRules: "",
    authContactName: "", authContactPhone: "", authContactEmail: "",
  });
  const [licenseFile, setLicenseFile] = useState<File[]>([]);
  const [licenseError, setLicenseError] = useState("");
  const [authDocFile, setAuthDocFile] = useState<File[]>([]);
  const [authDocError, setAuthDocError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const countrySelectOptions = useMemo(
    () => countryOptions(locale).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` })),
    [locale],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 核验历史不再在认证页展示（统一走站内通知）；这里只取主体、查重与风险提示
      const { buyer: b, duplicates: dups, riskFlags: risks } = await fetchMyBuyerWithVerifications();
      setDuplicates(dups);
      setRiskFlags(risks);
      if (b) {
        setBuyer(b);
        setForm((p) => ({
          ...p,
          orgName: b.orgName, buyerRole: b.buyerRole || "end_buyer",
          country: b.countryCode || guessCountryCode(b.country) || "", regNo: b.regNo, taxNo: b.taxNo,
          website: b.website, officialEmail: b.officialEmail, officialPhone: b.officialPhone,
          externalRules: b.externalRules,
          // 联系人已合并到 auth_contact_*：老数据由迁移 022 从 leader_* 回填，
          // leader_* 已随结构收敛退役，前端不再兜底
          authContactName: b.authContactName || "",
          authContactPhone: b.authContactPhone || "",
          authContactEmail: b.authContactEmail || "",
        }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSave = async () => {
    // 每一次保存都校验：页面标了 `*` 就必须齐全（首次创建与后续补件同一口径）。
    // 2026-11 缺陷：原逻辑只在 !buyer 时校验，已存在主体把必填项清空也能保存。
    const missing = missingBuyerFields({
      orgName: form.orgName,
      buyerRole: form.buyerRole,
      country: form.country,
      regNo: form.regNo,
      officialEmail: form.officialEmail,
      authContactName: form.authContactName,
      hasLicense: Boolean(buyer?.licenseFileUrl) || licenseFile.length > 0,
      hasAgentAuthDoc: Boolean(buyer?.agentAuthFileUrl) || authDocFile.length > 0,
    });
    if (missing.length > 0) {
      const labels = missing.map((key) => {
        switch (key) {
          case "org_name": return t("pc_borgname");
          case "buyer_role": return t("pc_brole");
          case "country": return t("pc_bcountry");
          case "reg_no": return t("pc_bregno");
          case "official_email": return t("pc_bemail");
          case "auth_contact_name": return t("pc_bauthcontact_name");
          case "license": return t("pc_blicense");
          case "agent_auth_doc": return t("pc_bauthdoc");
        }
        return key;
      });
      setMessage(`${t("pc_err_required")}：${labels.join("、")}`);
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
      // 与表单条件显示同一口径：只有「采购方授权代理」才上传代理授权文件。
      // 防止先选了文件、再把角色改回自采，保存时仍把无关文件传上去。
      if (form.buyerRole === "authorized_agent" && authDocFile.length > 0 && authDocFile[0]) {
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
        country: form.country ? countryName(form.country, locale) : "",
        countryCode: form.country,
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
  /** 字段说明：告诉用户"为什么需要"，而不是再加一条规则 */
  const labelCls = "text-sm font-semibold text-secondary-700 block";
  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const roleOptions = ["end_buyer", "authorized_agent", "general_contractor", "intermediary"];

  /** 当前状态（唯一权威）——文案只给"处于什么状态"，意见单独成块，等待时长单独算 */
  const statusBanner = buyer
    ? buyer.status === "verified"
      ? { cls: "bg-teal-50 border-teal-200 text-teal-800", badge: "bg-teal-100 text-teal-800", text: t("pc_bflow_verified_done") }
      : buyer.status === "need_info"
        ? { cls: "bg-amber-50 border-amber-200 text-amber-800", badge: "bg-amber-100 text-amber-800", text: t("pc_bflow_need_info") }
        : buyer.status === "restricted"
          ? { cls: "bg-red-50 border-red-200 text-red-700", badge: "bg-red-100 text-red-700", text: t("pc_bflow_restricted") }
          : { cls: "bg-amber-50 border-amber-200 text-amber-800", badge: "bg-amber-100 text-amber-800", text: t("pc_bflow_pending") }
    : { cls: "bg-blue-50 border-blue-200 text-blue-800", badge: "bg-blue-100 text-blue-800", text: t("pc_bflow_new") };

  /** 等待时长（仅在"已提交待核验"时有意义）：显示为天数或小时 */
  const waited =
    buyer?.submittedAt && buyer.status === "pending"
      ? (() => {
          const sec = Math.max(0, Math.floor(Date.now() / 1000) - buyer.submittedAt);
          const days = Math.floor(sec / 86400);
          return days >= 1
            ? t("pc_bstatus_wait_days", { days })
            : t("pc_bstatus_wait_hours", { hours: Math.floor(sec / 3600) });
        })()
      : "";

  /** 下一步 CTA：跳转而不是"提示用户自己去找表单" */
  const goForm = () => {
    const el = typeof document === "undefined" ? null : document.getElementById("buyer-form");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const statusAction =
    !buyer || buyer.status === "need_info" ? (
      <button
        type="button"
        onClick={goForm}
        className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
      >
        {t("pc_bstatus_go_form")}
      </button>
    ) : buyer.status === "verified" ? (
      <Link href="/rfq" className="mt-3 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
        {t("pc_wb_new")}
      </Link>
    ) : null;

  if (loading) return <div className="py-10 text-center text-sm text-secondary-400">…</div>;

  const sectionTitle = (s: string) => (
    <div className="col-span-full mt-2 border-b border-secondary-100 pb-1 text-xs font-bold uppercase tracking-wide text-secondary-400">{s}</div>
  );

  // 外部采购规则：单列字符串 ↔ 多选 code + 自由补充（兼容历史自由文本）
  const decodedRules = decodeExternalRules(form.externalRules);

  return (
    <div className="space-y-4">
      {/* 流程位置：第 1 步 */}
      <div className="rounded-2xl border border-secondary-200 bg-white p-4 shadow-xs">
        <FlowStepper current={1} />
      </div>

      {/* 当前认证状态（唯一权威）：状态徽章 + 结论一句话 + 等待时长 + 最近意见 + 下一步 CTA */}
      <div className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-secondary-900">{t("pc_bstatus_title")}</h2>
          {buyer && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBanner.badge}`}>
              {t(`pc_buyer_status_${buyer.status}`)}
            </span>
          )}
        </div>
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${statusBanner.cls}`}>{statusBanner.text}</p>
        {waited && <p className="mt-2 text-xs text-secondary-500">{waited}</p>}
        {buyer?.verifyNote && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            {t("pc_bverify_note")}：{buyer.verifyNote}
          </p>
        )}
        {statusAction}
      </div>

      <div id="buyer-form" className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-lg font-extrabold text-secondary-900">{t("pc_bpage_title")}</h1>
          {buyer?.buyerNo && (
            <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-semibold text-secondary-600">
              {t("pc_buyerNo")}：{buyer.buyerNo}
            </span>
          )}
        </div>
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
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_borgname")} *
              <FieldHintTooltip label={t("pc_borgname")} content={t("pc_bhint_orgname")} />
            </span>
            <input value={form.orgName} onChange={(e) => f("orgName", e.target.value)} className={inputCls} />
            <span className="mt-1 block text-[11px] font-normal leading-relaxed text-amber-600">{t("pc_bhint_orgname_rename")}</span>
          </label>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_brole")} *
              <FieldHintTooltip label={t("pc_brole")} content={t("pc_bhint_role")} />
            </span>
            <select value={form.buyerRole} onChange={(e) => f("buyerRole", e.target.value)} className={inputCls}>
              {roleOptions.map((v) => <option key={v} value={v}>{t(`pc_brole_${v}`)}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            {t("pc_bcountry")} *
            <SearchableSelect
              options={countrySelectOptions}
              value={form.country || null}
              onChange={(value) => f("country", String(value ?? ""))}
              placeholder={t("pc_country_search")}
              className="mt-1"
            />
          </label>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_bregno")} *
              <FieldHintTooltip label={t("pc_bregno")} content={t("pc_bhint_regno")} />
            </span>
            <input value={form.regNo} onChange={(e) => f("regNo", e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>{t("pc_btaxno")}<input value={form.taxNo} onChange={(e) => f("taxNo", e.target.value)} className={inputCls} /></label>

          {sectionTitle(t("pc_bsec_license"))}
          <div className="col-span-full">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-secondary-600">
              {t("pc_blicense")} *
              <FieldHintTooltip label={t("pc_blicense")} content={t("pc_bhint_license")} />
            </div>
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
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_bemail")} *
              <FieldHintTooltip label={t("pc_bemail")} content={t("pc_bhint_email")} />
            </span>
            <input value={form.officialEmail} onChange={(e) => f("officialEmail", e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>{t("pc_bphone")}<input value={form.officialPhone} onChange={(e) => f("officialPhone", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_bwebsite")}
              <FieldHintTooltip label={t("pc_bwebsite")} content={t("pc_bhint_website")} />
            </span>
            <input value={form.website} onChange={(e) => f("website", e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_bauthcontact_name")} *
              <FieldHintTooltip label={t("pc_bauthcontact_name")} content={t("pc_bhint_contact")} />
            </span>
            <input value={form.authContactName} onChange={(e) => f("authContactName", e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>{t("pc_bauthcontact_phone")}<input value={form.authContactPhone} onChange={(e) => f("authContactPhone", e.target.value)} className={inputCls} /></label>
          <label className={labelCls}>{t("pc_bauthcontact_email")}<input value={form.authContactEmail} onChange={(e) => f("authContactEmail", e.target.value)} className={inputCls} /></label>

          {sectionTitle(t("pc_bsec_auth"))}
          {/* 代理采购授权文件只对「采购方授权代理」有意义：它证明的是"委托方授权你采购"，
              与自己采购（最终采购方）无关。口径与 buyer-compliance.ts:96 的风险提示一致——
              界面显示什么和系统在意什么是同一件事，避免"显示了但没人看"。 */}
          {form.buyerRole === "authorized_agent" ? (
            <div className="col-span-full">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-secondary-600">
                {t("pc_bauthdoc")} *
                <FieldHintTooltip label={t("pc_bauthdoc")} content={t("pc_bauthdoc_hint")} />
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                <a href="/downloads/templates/procurement-agent-authorization-template.docx" download className="text-teal-700 underline">
                  {t("pc_bauthdoc_word")}
                </a>
                <a href="/downloads/templates/procurement-agent-authorization-template.pdf" download className="text-teal-700 underline">
                  {t("pc_bauthdoc_pdf")}
                </a>
              </div>
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
          ) : (
            <p className="col-span-full rounded-lg bg-secondary-50 px-3 py-2 text-xs text-secondary-500">{t("pc_bauthdoc_na")}</p>
          )}

          {sectionTitle(t("pc_bsec_extra"))}
          <div className="col-span-full">
            <div className="flex items-center gap-1.5">
              <span className={labelCls}>{t("pc_bexternalrules")}</span>
              <FieldHintTooltip
                label={t("pc_bexternalrules")}
                content={
                  <div className="space-y-1.5">
                    <div>{t("pc_brules_help")}</div>
                    <div className="text-secondary-500">{t("pc_bhint_rules")}</div>
                  </div>
                }
              />
            </div>
            {EXTERNAL_RULE_GROUPS.map((group) => (
              <div key={group.labelKey} className="mt-3">
                <div className="mb-1.5 text-xs text-secondary-400">{t(group.labelKey)}</div>
                <ChipToggleGroup
                  selected={decodedRules.codes}
                  onToggle={(code) =>
                    setForm((p) => {
                      const cur = decodeExternalRules(p.externalRules);
                      const next = cur.codes.includes(code)
                        ? cur.codes.filter((c) => c !== code)
                        : [...cur.codes, code];
                      return { ...p, externalRules: encodeExternalRules(next, cur.other) };
                    })
                  }
                  items={group.codes.map((code) => ({
                    value: code,
                    label: t(ruleLabelKey(code)),
                  }))}
                />
              </div>
            ))}
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-normal text-secondary-400">{t("pc_brules_other")}</span>
              <input
                value={decodedRules.other}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    externalRules: encodeExternalRules(
                      decodeExternalRules(p.externalRules).codes,
                      e.target.value,
                    ),
                  }))
                }
                maxLength={EXTERNAL_RULE_NOTE_MAX}
                placeholder={t("pc_brules_other_ph")}
                className={inputCls}
              />
            </label>
          </div>
        </div>

        {message && <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${messageCls}`}>{message}</div>}
        <div className="mt-5 flex items-center gap-3">
          <button type="button" disabled={saving} onClick={onSave} className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50">
            {saving ? "…" : t("pc_bsave")}
          </button>
        </div>
      </div>
    </div>
  );
}
