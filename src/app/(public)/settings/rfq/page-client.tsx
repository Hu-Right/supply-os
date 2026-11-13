"use client";

/**
 * 我的采购需求 — 买方工作台（v2）
 * @module app/(public)/settings/rfq/page-client
 *
 * @description 读 `/api/rfq/demands/mine`，7 态 + 结案原因展示；状态文案统一走
 *              `features/rfq/model/status`（唯一事实源），时间与金额走 `model/format`。
 *              待审核 / 审核中显示 SLA 等待时长，报价中显示截止倒计时。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Eye, FileText, Lock, Pencil, Undo2, XCircle } from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { Button, EmptyState } from "@/shared/ui";
import { DEMAND_STATUS, REVIEW_SLA_HOURS, type DemandStatus } from "@/shared/constants/rfq-demand";
import { statusMeta, WORKBENCH_TABS, type StatusAction } from "@/features/rfq/model/status";
import { formatBudget, formatCloseCountdown, formatReviewWait, formatYmd } from "@/features/rfq/model/format";

interface MyDemand {
  id: number;
  reference: string;
  title: string;
  status: DemandStatus | string;
  revision: number;
  province: string;
  budgetAmount: number | null;
  budgetConfidential: boolean;
  currency: string;
  deadlineSec: number;
  submittedAt: number | null;
  publishedAt: number | null;
  rejectReason: string;
  closeReason: string;
  createdAt: number | null;
  quoteCount: number;
  quotePending: number;
}

export default function MyRfqSettingsClient() {
  const router = useRouter();
  const { authUser } = useAuth();
  const [items, setItems] = useState<MyDemand[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchList = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    api<{ items: MyDemand[]; total: number }>(`/api/rfq/demands/mine${qs}`)
      .then((res) => {
        setItems(Array.isArray(res.items) ? res.items : []);
        setTotal(Number(res.total) || 0);
      })
      .catch((e) => {
        console.warn("[MyRfq] 需求列表加载失败:", e);
        setLoadError(e instanceof Error ? e.message : "网络异常，请稍后重试");
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleAction = async (action: "withdraw" | "unsubmit", id: number) => {
    const confirmText =
      action === "withdraw"
        ? "确认撤回此采购需求？撤回后将从需求广场下架，且不可恢复。"
        : "撤回提交？需求将回到草稿，修改后可重新提交。";
    if (!confirm(confirmText)) return;
    setBusyId(id);
    try {
      const path = action === "withdraw" ? "withdraw" : "unsubmit";
      await api(`/api/rfq/demands/${id}/${path}`, { method: "POST", body: {} });
      fetchList();
    } catch (err) {
      alert((err as Error).message || "操作失败");
      fetchList();
    } finally {
      setBusyId(null);
    }
  };

  const runAction = (action: StatusAction, item: MyDemand) => {
    if (action === "edit") router.push(`/settings/rfq/${item.id}/edit`);
    else if (action === "view" || action === "compare") router.push(`/rfq/${item.id}`);
    else if (action === "withdraw") void handleAction("withdraw", item.id);
    else if (action === "unsubmit") void handleAction("unsubmit", item.id);
  };

  if (!authUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-slate-900 mb-2">查看我的采购需求需要先登录</h3>
        <p className="text-sm text-slate-500 mb-6">登录后可管理已发布与审核中的采购需求</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">我的采购需求</h2>
          <p className="text-xs text-slate-500 mt-1">共 {total} 条需求</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {WORKBENCH_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === tab.value
                  ? "bg-teal-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-teal-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
              <div className="h-5 w-48 bg-slate-100 rounded mb-3" />
              <div className="h-4 w-32 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="text-sm font-bold text-rose-700">需求列表加载失败</p>
          <p className="mt-1 text-xs text-rose-600">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchList}>重试</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={statusFilter ? "该状态下暂无需求" : "您还没有发布采购需求"}
          description="前往需求发布页创建您的第一条采购需求"
          action={<Button variant="primary" onClick={() => router.push("/rfq")}>发布新需求</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = statusMeta(item.status, item.closeReason);
            const wait = formatReviewWait(item.submittedAt, REVIEW_SLA_HOURS);
            const showWait = item.status === DEMAND_STATUS.SUBMITTED || item.status === DEMAND_STATUS.UNDER_REVIEW;
            const showCountdown =
              item.status === DEMAND_STATUS.PUBLISHED || item.status === DEMAND_STATUS.EVALUATION;
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${meta.tone}`}>
                        {meta.label}
                      </span>
                      <span className="text-2xs text-slate-400">{item.reference || `#${item.id}`}</span>
                      {item.revision > 0 && (
                        <span className="text-2xs text-slate-400">v{item.revision}</span>
                      )}
                      {item.status === DEMAND_STATUS.PUBLISHED && item.publishedAt && (
                        <span className="text-2xs text-slate-400">发布于 {formatYmd(item.publishedAt)}</span>
                      )}
                      {item.createdAt && (
                        <span className="text-2xs text-slate-400">创建于 {formatYmd(item.createdAt)}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{item.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {formatBudget(item.budgetAmount, item.currency, item.budgetConfidential)}
                      </span>
                      {item.deadlineSec > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          截止 {formatYmd(item.deadlineSec)}
                          {showCountdown ? `（${formatCloseCountdown(item.deadlineSec)}）` : ""}
                        </span>
                      )}
                      {showWait && wait.text && (
                        <span className={`font-semibold ${wait.overdue ? "text-rose-600" : "text-amber-700"}`}>
                          {wait.text}
                        </span>
                      )}
                      {item.quoteCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-2xs font-bold text-teal-700">
                          收到 {item.quoteCount} 条报价
                        </span>
                      )}
                    </div>
                    {item.status === DEMAND_STATUS.REJECTED && item.rejectReason && (
                      <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        退回意见：{item.rejectReason}
                      </p>
                    )}
                    {meta.hint && (
                      <p className="mt-1.5 text-2xs text-slate-400">{meta.hint}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {meta.actions.includes("edit") && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => runAction("edit", item)}>
                        <Pencil className="w-3.5 h-3.5" /> 编辑
                      </Button>
                    )}
                    {meta.actions.includes("unsubmit") && (
                      <Button
                        variant="outline" size="sm" className="gap-1"
                        disabled={busyId === item.id}
                        onClick={() => runAction("unsubmit", item)}
                      >
                        <Undo2 className="w-3.5 h-3.5" /> 撤回提交
                      </Button>
                    )}
                    {meta.actions.includes("withdraw") && (
                      <Button
                        variant="outline" size="sm" className="gap-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={busyId === item.id}
                        onClick={() => runAction("withdraw", item)}
                      >
                        <XCircle className="w-3.5 h-3.5" /> 撤回需求
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => runAction("view", item)}>
                      <Eye className="w-3.5 h-3.5" /> 查看
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
