"use client";

// i18n-allow-file: 授权书正文是双语（中/英并列）法律文本，作为打印件固定输出、不随界面语言切换；
// 本文件的**操作区**文案已全部走 t()，仅正文段落保持中英对照。

/**
 * 发布流程第 4/5 步：授权书生成 + 签字盖章上传 + 在线确认（内联在发布页，不再跳设置中心）
 *
 * @module app/(public)/rfq/[id]/publish/AuthorizationPanel
 * @description 2026-11 流程收口：原 `/settings/rfq/[id]/authorization-letter` 是独立页，
 *              继承「账户设置」布局外壳，用户从向导提交后被"送进设置中心"，主观上像被弹回。
 *              现内联为发布页里的一张卡：正文可直接打印（`print:` 样式把操作区隐藏），
 *              签署仍走同一后端接口（版本 + 内容哈希绑定，改稿自动失效）。
 */
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { FileDropzone } from "@/features/procurement-demand/FileDropzone";
import { fetchAuthorization, type ProjectDetail } from "@/features/procurement-demand/api";
import {
  AUTHORIZED_PARTY_EN,
  AUTHORIZED_PARTY_ZH,
  AUTH_LETTER_NOTE,
  buildLetterSections,
} from "@/shared/constants/procurement-authorization-letter";

type AuthStatus = Awaited<ReturnType<typeof fetchAuthorization>>;

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-teal-100 text-teal-800",
  rejected: "bg-red-100 text-red-700",
};

function fmtDate(sec: number | null): string {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function AuthorizationPanel({
  projectId,
  detail,
  onSigned,
}: {
  projectId: number;
  detail: ProjectDetail;
  onSigned?: () => void;
}) {
  const { t } = useLocale();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [scanFiles, setScanFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [signedOk, setSignedOk] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setAuth(await fetchAuthorization(projectId));
    } catch (err) {
      setAuth(null);
      setLoadError((err as Error).message || t("pc_auth_load_failed"));
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onConfirmSign = async () => {
    setFormError("");
    if (!auth) {
      // 状态没拉到时不能静默失败：明确让用户重试（旧页这里是死按钮）
      setFormError(t("pc_auth_load_failed"));
      return;
    }
    if (!signerName.trim()) {
      setFormError(t("pc_auth_signer"));
      return;
    }
    if (scanFiles.length === 0) {
      setFormError(t("pc_auth_scan"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", scanFiles[0]);
      fd.append("signerName", signerName.trim());
      fd.append("letterHash", auth.letterHash);
      fd.append("versionNo", String(detail.versionNo));
      await api(`/api/procurement/projects/${projectId}/authorization`, { method: "POST", body: fd });
      setScanFiles([]);
      setSignedOk(true);
      await load();
      onSigned?.();
    } catch (err) {
      setFormError((err as Error).message || t("pc_err_generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const sections = buildLetterSections();
  const projectTitle = detail.titleZh || detail.titleEn || detail.reference;
  const status = auth?.status ?? "none";
  const badge = status !== "none" ? (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLS[status] ?? "bg-secondary-100 text-secondary-600"}`}>
      {t(`pc_wb_auth_${status}`)}
    </span>
  ) : null;

  return (
    <section className="rounded-2xl border border-secondary-200 bg-white shadow-xs print:rounded-none print:border-0 print:shadow-none">
      {/* 操作区（打印时隐藏） */}
      <div className="print:hidden border-b border-secondary-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-secondary-900">{t("pc_auth_title")}</h3>
          <div className="flex items-center gap-2">
            {badge}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-semibold text-secondary-700 hover:bg-secondary-50"
            >
              {t("pc_auth_print")}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {loadError}
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              {t("pc_retry")}
            </button>
          </div>
        )}

        {auth?.status === "rejected" && auth.rejectReason && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {t("pc_review_notes")}：{auth.rejectReason}
          </div>
        )}

        {status === "verified" ? (
          <p className="mt-3 text-xs text-teal-700">{t("pc_auth_verified_hint")}</p>
        ) : (
          <div className="mt-4 grid gap-3 border-t border-secondary-100 pt-4">
            <label className="text-xs font-semibold text-secondary-600">
              {t("pc_auth_signer")}
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm"
                placeholder={t("pc_auth_signer_ph")}
              />
            </label>
            <div className="text-xs font-semibold text-secondary-600">
              {t("pc_auth_scan")}
              <div className="mt-1">
                <FileDropzone
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  maxSizeBytes={10 * 1024 * 1024}
                  files={scanFiles}
                  onFilesChange={setScanFiles}
                  compact
                />
              </div>
            </div>
            {auth && auth.signerName && (
              <p className="text-xs text-teal-700">
                {t("pc_auth_signed", { name: auth.signerName, date: fmtDate(auth.signedAt) })}
              </p>
            )}
            {signedOk && <p className="text-xs text-teal-700">{t("pc_auth_signed", { name: signerName, date: fmtDate(Date.now() / 1000) })}</p>}
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void onConfirmSign()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? t("pc_submitting") : t("pc_auth_confirm")}
              </button>
            </div>
            <p className="text-xs text-secondary-400">{t("pc_auth_note")}</p>
          </div>
        )}
      </div>

      {/* 授权书正文（打印主体） */}
      <div className="p-8 print:p-0">
        <h1 className="text-center text-xl font-extrabold text-secondary-900">采购需求发布与供应商智能匹配授权书</h1>
        <p className="text-center text-sm text-secondary-600">Authorization for Publication of Procurement Requirements and Supplier Matching</p>

        <div className="mt-6 space-y-2 text-sm text-secondary-800">
          <p>授权方（采购方）：{detail.buyerOrgName || "__________________________________"}</p>
          <p className="text-secondary-500">Authorizing Party (Buyer): {detail.buyerOrgName || "__________________________________"}</p>
          <p>被授权方：{AUTHORIZED_PARTY_ZH}</p>
          <p className="text-secondary-500">Authorized Party: {AUTHORIZED_PARTY_EN}</p>
          <p>采购项目名称：{projectTitle}</p>
          <p className="text-secondary-500">Project Name: {projectTitle}</p>
          <p>采购需求编号：{detail.reference} · 需求版本：v{detail.versionNo}</p>
          <p className="text-secondary-500">Requirement ID: {detail.reference} · Requirement Version: v{detail.versionNo}</p>
        </div>

        <div className="mt-6 space-y-4">
          {Array.from({ length: sections.length / 2 }, (_, k) => {
            const heading = sections[k * 2];
            const body = sections[k * 2 + 1];
            return (
              <div key={k}>
                <p className="text-sm font-bold text-secondary-900">{heading.zh}</p>
                <p className="text-sm font-bold text-secondary-500">{heading.en}</p>
                <p className="mt-1 text-sm leading-relaxed text-secondary-800">{body.zh}</p>
                <p className="mt-1 text-xs leading-relaxed text-secondary-500">{body.en}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 text-sm text-secondary-800 sm:grid-cols-3 print:break-inside-avoid">
          <div>
            <p>授权方（盖章）/ Buyer&apos;s Seal:</p>
            <p className="mt-8 border-b border-secondary-300">&nbsp;</p>
          </div>
          <div>
            <p>授权代表签字 / Authorized Signature:</p>
            <p className="mt-8 border-b border-secondary-300">&nbsp;</p>
          </div>
          <div>
            <p>签署日期 / Date:</p>
            <p className="mt-8 border-b border-secondary-300">&nbsp;</p>
          </div>
        </div>

        <p className="mt-8 text-xs text-secondary-500">{AUTH_LETTER_NOTE.zh}</p>
        <p className="text-xs text-secondary-400">{AUTH_LETTER_NOTE.en}</p>
        {auth && (
          <p className="mt-4 text-[10px] text-secondary-300 print:text-secondary-400">
            授权书内容指纹 / Content hash: {auth.letterHash}（模板版本 v1 · 需求版本 v{detail.versionNo}）
          </p>
        )}
      </div>
    </section>
  );
}
