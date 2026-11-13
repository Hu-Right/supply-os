"use client";

/**
 * 受邀需求 — 供应商工作台
 * @module app/(public)/settings/rfq-invites/page-client
 *
 * @description 定向邀约（targeted）需求对供应商的唯一落地面。重构前这类需求没有入口：
 *              广场不展示、详情只给摘要，受邀供应商无从得知自己被邀约。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Lock, MailCheck } from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { Button, Card, EmptyState } from "@/shared/ui";
import { statusMeta } from "@/features/rfq/model/status";
import { formatBudget, formatCloseCountdown, formatYmd } from "@/features/rfq/model/format";

interface InvitedDemand {
  id: number;
  reference: string;
  title: string;
  status: string;
  closeAt: number | null;
  categoryL1: string;
  categoryL2: string;
  province: string;
  budgetAmount: number | null;
  budgetConfidential: boolean;
  currency: string;
  sentAt: number | null;
  quoted: boolean;
}

export default function RfqInvitesClient() {
  const router = useRouter();
  const { authUser } = useAuth();
  const [items, setItems] = useState<InvitedDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    setLoading(true);
    setError("");
    api<{ items: InvitedDemand[] }>("/api/rfq/invitations/mine")
      .then((res) => setItems(Array.isArray(res.items) ? res.items : []))
      .catch((e: Error) => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [authUser]);

  if (!authUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-slate-900 mb-2">查看受邀需求需要先登录</h3>
        <p className="text-sm text-slate-500 mb-6">登录后可查看采购方定向邀约给你的需求</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">受邀需求</h2>
        <p className="text-xs text-slate-500 mt-1">
          采购方定向邀约给你的需求，仅你与被邀约的供应商可见
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
              <div className="h-5 w-48 bg-slate-100 rounded mb-3" />
              <div className="h-4 w-32 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="text-sm font-bold text-rose-700">受邀需求加载失败</p>
          <p className="mt-1 text-xs text-rose-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>重试</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="暂无受邀需求"
          description="当采购方定向邀约你时，需求会出现在这里"
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = statusMeta(item.status);
            const closed = item.status === "evaluation";
            return (
              <Card key={item.id} className="rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${meta.tone}`}>
                        {meta.label}
                      </span>
                      <span className="text-2xs text-slate-400">{item.reference || `#${item.id}`}</span>
                      {item.sentAt && (
                        <span className="inline-flex items-center gap-1 text-2xs text-slate-400">
                          <MailCheck className="w-3 h-3" /> 邀约于 {formatYmd(item.sentAt)}
                        </span>
                      )}
                      {item.quoted && (
                        <span className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-2xs font-bold text-teal-700">
                          已报价
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{item.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Inbox className="w-3.5 h-3.5" />
                        {formatBudget(item.budgetAmount, item.currency, item.budgetConfidential)}
                      </span>
                      {item.closeAt && (
                        <span>截止 {formatYmd(item.closeAt)}（{formatCloseCountdown(item.closeAt)}）</span>
                      )}
                      {(item.categoryL1 || item.categoryL2) && (
                        <span>{[item.categoryL1, item.categoryL2].filter(Boolean).join(" / ")}</span>
                      )}
                      {item.province && <span>{item.province}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Button
                      variant={closed || item.quoted ? "outline" : "primary"}
                      size="sm"
                      onClick={() => router.push(`/rfq/${item.id}`)}
                    >
                      {closed ? "查看结果" : item.quoted ? "查看报价" : "查看并报价"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
