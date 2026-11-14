// i18n-allow-file: 采购需求发布与供应商智能匹配授权书为双语法律文本（以中文法律版为准），
// 不随界面语言切换；页面操作区文案与授权书正文同源双语展示（同隐私政策等法律页豁免口径）
"use client";

/**
 * /settings/rfq/[id]/authorization-letter — 授权书生成与签署（七步流程第 4/5 步）
 *
 * @module app/(public)/settings/rfq/[id]/authorization-letter/page
 * @description 需求提交（版本冻结）后进入本页：① 系统按「需求编号 + 版本」生成双语授权书
 *              （打印/另存 PDF）；② 采购方线下签字盖章后上传扫描件并在线确认签署——
 *              签署动作绑定身份/时间/IP/授权书内容哈希（letterHash）；③ 云境核验通过
 *              （verified）是发布的前置条件（流程第 6 步闸口）。
 *              版本绑定：需求改稿重提后 revision_no 变化，本页自动按新版本重新生成授权书，
 *              旧签署失效须重签（授权书第五条）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/core/http";
import {
  AUTHORIZED_PARTY_EN,
  AUTHORIZED_PARTY_ZH,
  AUTH_LETTER_NOTE,
  buildLetterSections,
} from "@/lib/services/rfq/authorization-letter";

interface DemandDetail {
  id: number;
  reference: string;
  title: string;
  status: string;
  revision: number;
  buyerOrgName?: string;
}

interface AuthorizationStatus {
  letterHash: string;
  revisionNo: number;
  latest: {
    id: number;
    status: "pending" | "verified" | "rejected";
    signerName: string;
    signedAt: number;
    fileUrl: string;
    rejectReason: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, { zh: string; en: string; cls: string }> = {
  pending: { zh: "待云境OS核验", en: "Pending verification", cls: "bg-amber-100 text-amber-800" },
  verified: { zh: "已核验通过", en: "Verified", cls: "bg-teal-100 text-teal-800" },
  rejected: { zh: "核验未通过", en: "Rejected", cls: "bg-red-100 text-red-700" },
};

function fmtDate(sec: number | null): string {
  if (!sec) return "____年____月____日 / ____-__-__";
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function AuthorizationLetterPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [detail, setDetail] = useState<DemandDetail | null>(null);
  const [auth, setAuth] = useState<AuthorizationStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api<DemandDetail>(`/api/rfq/demands/${id}`);
      setDetail(d);
    } catch (err) {
      setLoadError((err as Error).message || "需求加载失败 / Failed to load demand");
      return;
    }
    try {
      const a = await api<AuthorizationStatus>(`/api/rfq/demands/${id}/authorization`);
      setAuth(a);
    } catch {
      setAuth(null);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onConfirmSign = async () => {
    setFormError("");
    if (!detail || !auth) return;
    if (!signerName.trim()) { setFormError("请填写授权代表姓名 / Please fill in the authorized representative name"); return; }
    if (!file) { setFormError("请上传签字盖章的扫描件 / Please upload the signed & sealed scan"); return; }
    if (file.size > 10 * 1024 * 1024) { setFormError("扫描件不能超过 10MB / Max 10MB"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("signerName", signerName.trim());
      fd.append("letterHash", auth.letterHash);
      fd.append("revisionNo", String(detail.revision));
      await api(`/api/rfq/demands/${id}/authorization`, { method: "POST", body: fd });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setFormError((err as Error).message || "签署失败 / Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-secondary-500">
        {loadError}
        <div className="mt-4"><Link className="text-teal-600 underline" href="/settings/rfq">返回工作台 / Back to workspace</Link></div>
      </div>
    );
  }
  if (!detail) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-secondary-400">加载中… / Loading…</div>;
  }

  const sections = buildLetterSections();
  const st = auth?.latest ? STATUS_LABEL[auth.latest.status] : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 操作区（打印时隐藏） */}
      <div className="print:hidden mb-6 rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-secondary-700">
            <span className="font-semibold">第 5 步 / Step 5：</span>
            下载打印本授权书 → 签字盖章 → 上传扫描件并在线确认
            <span className="ml-2 text-secondary-400">/ Print, sign &amp; seal, upload the scan and confirm online</span>
          </div>
          <div className="flex items-center gap-2">
            {st && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.zh} / {st.en}</span>}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-semibold text-secondary-700 hover:bg-secondary-50"
            >
              打印 / 另存 PDF
            </button>
          </div>
        </div>
        {auth?.latest?.status === "rejected" && auth.latest.rejectReason && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">核验意见：{auth.latest.rejectReason}</div>
        )}
        {auth?.latest?.status === "verified" ? (
          <div className="mt-3 text-xs text-teal-700">✓ 授权已核验，等待/已完成发布。需求改稿重提后需重新签署。</div>
        ) : (
          <div className="mt-4 grid gap-3 border-t border-secondary-100 pt-4">
            <label className="text-xs font-semibold text-secondary-600">
              授权代表姓名 / Authorized representative name
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm"
                placeholder="与签字一致 / Same as the signature"
              />
            </label>
            <label className="text-xs font-semibold text-secondary-600">
              签字盖章扫描件（jpg/png/webp/pdf，≤10MB） / Signed &amp; sealed scan
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-sm"
              />
            </label>
            {auth?.latest?.fileUrl && (
              <a className="text-xs text-teal-600 underline" href={auth.latest.fileUrl} target="_blank" rel="noreferrer">
                查看已上传扫描件 / View uploaded scan（{auth.latest.signerName}，{fmtDate(auth.latest.signedAt)}）
              </a>
            )}
            {formError && <div className="text-xs text-red-600">{formError}</div>}
            <button
              type="button"
              disabled={submitting}
              onClick={onConfirmSign}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? "提交中… / Submitting…" : "确认签署 / Confirm & Sign"}
            </button>
            <p className="text-xs text-secondary-400">
              确认即视为通过可靠电子方式签署本授权书（记录账号、时间、IP 与文件哈希）；需求版本变更后本授权自动失效。
              / Confirming constitutes electronic signing; account, time, IP and file hash are recorded; authorization is void upon version change.
            </p>
          </div>
        )}
      </div>

      {/* 授权书正文（打印主体） */}
      <div className="rounded-2xl border border-secondary-200 bg-white p-8 shadow-xs print:border-0 print:shadow-none">
        <h1 className="text-center text-xl font-extrabold text-secondary-900">采购需求发布与供应商智能匹配授权书</h1>
        <p className="text-center text-sm text-secondary-600">Authorization for Publication of Procurement Requirements and Supplier Matching</p>

        <div className="mt-6 space-y-2 text-sm text-secondary-800">
          <p>授权方（采购方）：{detail.buyerOrgName || "__________________________________"}</p>
          <p className="text-secondary-500">Authorizing Party (Buyer): {detail.buyerOrgName || "__________________________________"}</p>
          <p>被授权方：{AUTHORIZED_PARTY_ZH}</p>
          <p className="text-secondary-500">Authorized Party: {AUTHORIZED_PARTY_EN}</p>
          <p>采购项目名称：{detail.title}</p>
          <p className="text-secondary-500">Project Name: {detail.title}</p>
          <p>采购需求编号：{detail.reference}　需求版本：v{detail.revision}</p>
          <p className="text-secondary-500">Requirement ID: {detail.reference}　Requirement Version: v{detail.revision}</p>
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

        <div className="mt-8 grid gap-6 text-sm text-secondary-800 sm:grid-cols-3">
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
            授权书内容指纹 / Content hash: {auth.letterHash}（模板版本 v1 · 需求版本 v{detail.revision}）
          </p>
        )}
      </div>
    </div>
  );
}
