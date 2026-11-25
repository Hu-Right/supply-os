// i18n-allow-file: 财务发票处理页（内部运营页，仅白名单账号可见）
/**
 * 财务发票处理（/settings/billing/ops）
 *
 * 一期人工开具：接单 → 录入发票号 + 上传 PDF/OFD/XML → 用户可下载；作废/红冲在此推进。
 * 页面本身不做权限判断，接口用 BILLING_OPS_USER_IDS 白名单返回 403。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, FileCheck2, Loader2, ReceiptText, Upload } from "lucide-react";
import { Badge, Button, Input, Modal, SegmentedControl } from "@/shared/ui";
import type { InvoiceRequestView } from "@/types/billing";
import {
  downloadInvoiceFile,
  fetchOpsInvoiceRequests,
  issueInvoiceWithFile,
  updateInvoiceStatusOps,
} from "./api";

const fmt = (n: number) => "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_LABEL: Record<string, string> = {
  pending: "待开票",
  issuing: "开票中",
  issued: "已开具",
  void: "已作废",
  red_flushed: "已红冲",
};

export function InvoiceOpsPanel() {
  const [items, setItems] = useState<InvoiceRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "issuing" | "issued">("pending");
  const [issueTarget, setIssueTarget] = useState<InvoiceRequestView | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const status = filter === "all" ? undefined : filter;
      setItems(await fetchOpsInvoiceRequests(status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败（可能没有处理权限）");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: number, action: "issuing" | "void" | "red_flushed") => {
    if ((action === "void" || action === "red_flushed") && !window.confirm(action === "void" ? "确认作废这张发票申请？" : "确认将这张已开具发票标记为红冲？")) return;
    setMessage("");
    try {
      await updateInvoiceStatusOps(id, action);
      setMessage("操作成功");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    }
  };

  const openIssue = (row: InvoiceRequestView) => {
    setIssueTarget(row);
    setInvoiceNo("");
    setFile(null);
    setModalError("");
  };

  const submitIssue = async () => {
    if (!issueTarget) return;
    if (!invoiceNo.trim()) { setModalError("请填写发票号码"); return; }
    if (!file) { setModalError("请选择发票文件（PDF/OFD/XML）"); return; }
    setSubmitting(true);
    setModalError("");
    try {
      await issueInvoiceWithFile(issueTarget.id, invoiceNo.trim(), file);
      setIssueTarget(null);
      setMessage("发票已开具，用户可在费用中心下载");
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "开具失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs text-secondary-400">
        <Link href="/settings/billing" className="flex items-center gap-0.5 hover:text-secondary-600"><ChevronLeft className="h-3.5 w-3.5" />费用中心</Link>
        <span>/</span><span className="font-semibold text-secondary-600">发票处理</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-secondary-900"><ReceiptText className="h-5 w-5 text-primary-600" />发票处理</h1>
        <span className="text-xs text-secondary-400">仅白名单账号可见；人工开具后用户可下载</span>
        <span className="ml-auto"><Button size="sm" variant="outline" onClick={() => void load()}>刷新</Button></span>
      </div>

      <SegmentedControl
        items={[
          { value: "pending", label: "待开票" },
          { value: "issuing", label: "开票中" },
          { value: "issued", label: "已开具" },
          { value: "all", label: "全部" },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
      />

      {message && <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800">{message}</p>}
      {loading && <div className="flex items-center gap-2 rounded-xl border border-secondary-200 bg-white px-4 py-10 text-sm text-secondary-500"><Loader2 className="h-4 w-4 animate-spin" />加载中…</div>}
      {!loading && error && <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-2xl border border-secondary-200 bg-white">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
              {["申请单", "用户", "类型", "金额", "抬头", "邮箱", "状态", "申请时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
            </tr></thead>
            <tbody className="text-xs">
              {items.map((r) => (
                <tr key={r.id} className="border-b border-secondary-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-secondary-800">#{r.id}</td>
                  <td className="px-4 py-3 font-mono text-secondary-600">{r.userId}</td>
                  <td className="px-4 py-3 text-secondary-700">{r.invoiceType === "special" ? "专票" : "普票"}</td>
                  <td className="px-4 py-3 font-semibold text-secondary-900">{fmt(r.amount)}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-secondary-700" title={r.title}>{r.title}</td>
                  <td className="px-4 py-3 text-secondary-500">{r.email}</td>
                  <td className="px-4 py-3"><Badge variant={r.status === "issued" ? "soft-success" : r.status === "void" || r.status === "red_flushed" ? "soft-neutral" : "soft-warning"} shape="tag">{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  <td className="px-4 py-3 text-secondary-500">{String(r.createdAt).slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {r.status === "pending" && <button type="button" onClick={() => void act(r.id, "issuing")} className="font-semibold text-primary-700 hover:underline">接单</button>}
                      {(r.status === "pending" || r.status === "issuing") && (
                        <button type="button" onClick={() => openIssue(r)} className="flex items-center gap-0.5 font-semibold text-primary-700 hover:underline"><Upload className="h-3 w-3" />开具</button>
                      )}
                      {(r.status === "pending" || r.status === "issuing") && (
                        <button type="button" onClick={() => void act(r.id, "void")} className="font-semibold text-secondary-500 hover:text-danger-600 hover:underline">作废</button>
                      )}
                      {r.status === "issued" && (
                        <>
                          <button type="button" onClick={() => r.invoiceFileUrl && void downloadInvoiceFile(r.invoiceFileUrl, `invoice_${r.invoiceNo || r.id}.${r.fileType || "pdf"}`)} className="flex items-center gap-0.5 font-semibold text-primary-700 hover:underline"><FileCheck2 className="h-3 w-3" />下载</button>
                          <button type="button" onClick={() => void act(r.id, "red_flushed")} className="font-semibold text-danger-600 hover:underline">红冲</button>
                        </>
                      )}
                      {r.status === "issued" && r.invoiceNo && <span className="font-mono text-secondary-400">#{r.invoiceNo}</span>}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-secondary-400">暂无记录</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(issueTarget)} onClose={() => setIssueTarget(null)} title="开具发票" className="max-w-md">
        {issueTarget && (
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary-50 px-3 py-2 text-xs text-secondary-600">
              申请单 #{issueTarget.id} · {fmt(issueTarget.amount)} · {issueTarget.invoiceType === "special" ? "增值税专用发票" : "电子普通发票"}
              <br />抬头：{issueTarget.title} {issueTarget.taxNo ? `（${issueTarget.taxNo}）` : ""}
            </div>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-foreground">发票号码</span>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="例如 24312000000012345678" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-foreground">发票文件（PDF / OFD / XML，≤10MB）</span>
              <input type="file" accept=".pdf,.ofd,.xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-border px-3 py-2 text-xs" />
            </label>
            {modalError && <p className="rounded-lg bg-danger-50 px-2 py-1.5 text-[11px] font-semibold text-danger-700">{modalError}</p>}
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => void submitIssue()} disabled={submitting}>{submitting ? "提交中…" : "确认开具"}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setIssueTarget(null)}>取消</Button>
            </div>
            <p className="text-[11px] text-secondary-400">开具前请确认已在电子税务局/开票平台完成开票；系统只记录结果，不直连税控。</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

