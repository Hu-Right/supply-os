"use client";

/**
 * 我的报价 — 供应商视角
 * My Quotes (Supplier View)
 *
 * @module app/(public)/rfq/my-quotes/page-client
 * @description 认证供应商查看自己对多条采购需求的报价及中标结果（评审中/已中标/未中标）。
 *              数据来自 GET /api/rfq/my-quotes。需登录；沿用账户页中文直写风格。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, Trophy } from "lucide-react";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";
import { Button, EmptyState } from "@/shared/ui";
import { currencySymbol } from "@/shared/utils/format";
import { fetchMyQuotes, type MyQuoteRow } from "@/core/api/rfqQuotes";

const QUOTE_BADGE: Record<string, { label: string; cls: string }> = {
  submitted: { label: "评审中", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  won: { label: "已中标", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  rejected: { label: "未中标", cls: "bg-rose-50 text-rose-600 border-rose-200" },
};

export default function MyQuotesClient() {
  const router = useRouter();
  const { authUser } = useAuth();
  const [rows, setRows] = useState<MyQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchMyQuotes()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: Error) => { if (!cancelled) setErr(e?.message || "加载失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser]);

  if (!authUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-slate-900 mb-2">查看我的报价需要先登录</h3>
        <p className="text-sm text-slate-500 mb-6">登录后在需求广场选择采购需求进行报价，并在此跟踪中标结果</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">我的报价</h2>
          <p className="text-xs text-slate-500 mt-1">共 {rows.length} 条报价</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/rfq")}>去需求广场报价</Button>
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
      ) : err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="你还没有提交报价"
          description="前往需求广场挑选合适的采购需求，提交你的第一份报价"
          action={<Button variant="primary" onClick={() => router.push("/rfq")}>去需求广场</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => {
            const badge = QUOTE_BADGE[q.quoteStatus] ?? { label: q.quoteStatus, cls: "bg-slate-100 text-slate-600 border-slate-200" };
            return (
              <div key={q.quoteId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${badge.cls}`}>
                        {q.quoteStatus === "won" && <Trophy className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                        {badge.label}
                      </span>
                      <span className="text-2xs text-slate-400">{q.reference || `#${q.rfqId}`}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{q.title}</h3>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                      <span className="text-slate-900 font-extrabold text-sm">
                        {currencySymbol(q.currency)}{q.price}
                        <span className="text-2xs font-normal text-slate-400 ml-1">{q.currency}</span>
                      </span>
                      {q.leadTimeDays != null && <span>交付周期：{q.leadTimeDays} 天</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => router.push(`/rfq/${q.rfqId}`)}>
                    <Eye className="w-3.5 h-3.5" /> 查看需求
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
