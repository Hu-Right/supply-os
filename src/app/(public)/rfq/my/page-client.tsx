"use client";

/**
 * 我的采购需求 — 客户端组件
 * My RFQs — Client Component
 *
 * @module app/(public)/rfq/my/page-client
 * @description 列表 + 状态筛选 + 撤回操作。需登录。
 */
import { useCallback, useEffect, useState } from "react";
import { Clock, Eye, Lock, FileText } from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { Button, EmptyState } from "@/shared/ui";

interface MyRfq {
  id: number;
  title: string;
  country: string;
  budgetUsd: number;
  deadlineSec: number;
  status: string;
  publishedDate: string | null;
  createdAt: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-slate-100 text-slate-600 border-slate-200" },
  published: { label: "已发布", color: "bg-teal-50 text-teal-700 border-teal-200" },
  closed: { label: "已撤回", color: "bg-rose-50 text-rose-600 border-rose-200" },
};

function formatBudget(v: number): string {
  if (!v || v <= 0) return "预算保密";
  return `USD ${Math.round(v)} 万`;
}

function formatDeadline(sec: number): string {
  if (!sec || sec <= 0) return "长期有效";
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function MyRfqPageClient() {
  const { authUser } = useAuth();
  const [items, setItems] = useState<MyRfq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [withdrawing, setWithdrawing] = useState<number | null>(null);

  const fetchList = useCallback(() => {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    api<{ items: MyRfq[]; total: number }>(`/api/rfq/my${qs}`)
      .then((res) => {
        setItems(Array.isArray(res.items) ? res.items : []);
        setTotal(Number(res.total) || 0);
      })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleWithdraw = async (id: number) => {
    if (!confirm("确认撤回此采购需求？撤回后将不再展示在需求广场。")) return;
    setWithdrawing(id);
    try {
      await api(`/api/rfq/${id}/withdraw`, { method: "PATCH", body: JSON.stringify({}) });
      fetchList();
    } catch (err) {
      alert((err as Error).message || "撤回失败");
    } finally {
      setWithdrawing(null);
    }
  };

  // 未登录
  if (!authUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-slate-900 mb-2">查看我的采购需求需要先登录</h3>
        <p className="text-sm text-slate-500 mb-6">登录后可管理已发布的采购需求</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">我的采购需求</h1>
          <p className="text-xs text-slate-500 mt-1">共 {total} 条需求</p>
        </div>
        <div className="flex gap-2">
          {[
            { value: "", label: "全部" },
            { value: "published", label: "已发布" },
            { value: "draft", label: "草稿" },
            { value: "closed", label: "已撤回" },
          ].map((tab) => (
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
      ) : items.length === 0 ? (
        <EmptyState
          title={statusFilter ? "该状态下暂无需求" : "您还没有发布采购需求"}
          description="前往需求发布页创建您的第一条采购需求"
          action={<Button variant="primary" onClick={() => window.location.href = "/rfq"}>发布新需求</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((rfq) => {
            const statusInfo = STATUS_MAP[rfq.status] || STATUS_MAP.draft;
            return (
              <div key={rfq.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-2xs text-slate-400">
                        #{rfq.id}
                      </span>
                      {rfq.publishedDate && (
                        <span className="text-2xs text-slate-400">
                          发布于 {rfq.publishedDate}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{rfq.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> {formatBudget(rfq.budgetUsd)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> 截止 {formatDeadline(rfq.deadlineSec)}
                      </span>
                      {rfq.country && <span>{rfq.country}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {rfq.status === "published" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleWithdraw(rfq.id)}
                        disabled={withdrawing === rfq.id}
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                      >
                        {withdrawing === rfq.id ? "撤回中…" : "撤回"}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1">
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
