"use client";

/**
 * RFQ 详情页
 * RFQ Detail Page
 *
 * @module app/(public)/rfq/[id]/page-client
 * @description 展示单条采购需求：结构化商务条款 + 需求描述。
 *              published 公开可见；创建者可查看未发布状态（isOwner 标记）。
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Building2, CalendarClock, FileText, Globe2, Landmark,
  MapPin, ShieldCheck, Truck, Wallet,
} from "lucide-react";

import { api } from "@/core/http";
import { Button, Card } from "@/shared/ui";

interface RfqDetail {
  id: number;
  title: string;
  description: string;
  status: string;
  categoryL1: string;
  categoryL2: string;
  province: string;
  budget: number | null;
  budgetConfidential: boolean;
  currency: string;
  incoterm: string;
  deliveryTime: string;
  deliveryAddress: string;
  paymentTerms: string[];
  supplierReqs: string[];
  visibility: string;
  deadlineSec: number;
  publishedDate: string | null;
  isOwner: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  closed: "已关闭",
};

function formatDeadline(sec: number): string {
  if (!sec) return "长期有效";
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatBudget(d: RfqDetail): string {
  if (d.budgetConfidential) return "面议（预算保密）";
  const budget = d.budget ?? 0;
  if (!budget) return "面议";
  const symbol: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥", HKD: "HK$" };
  const sym = symbol[d.currency] || d.currency;
  return `${sym}${budget}`;
}

function TermItem({ icon: Icon, label, value }: {
  icon: typeof Truck; label: string; value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl p-3 bg-secondary-50/60">
      <div className="w-8 h-8 rounded-lg bg-white border border-secondary-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-secondary-400">{label}</p>
        <p className="text-sm font-semibold text-secondary-800 break-words mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function RfqDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [detail, setDetail] = useState<RfqDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<{ code: number; data: RfqDetail }>(`/api/rfq/${id}`)
      .then((res) => setDetail(res.data))
      .catch((err: Error) => setError(err.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-secondary-400">加载中…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-secondary-500">{error || "需求不存在"}</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>返回</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 头部 */}
      <Card className="rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
            {STATUS_LABELS[detail.status] ?? detail.status}
          </span>
          {detail.categoryL1 && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-600 text-xs font-semibold">
              {detail.categoryL1}{detail.categoryL2 ? ` / ${detail.categoryL2}` : ""}
            </span>
          )}
          {detail.visibility === "targeted" && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-600 text-xs font-semibold">
              定向邀约
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-secondary-900 leading-snug">
          {detail.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-secondary-400">
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" />
            报价截止：{formatDeadline(detail.deadlineSec)}
          </span>
          {detail.publishedDate && (
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              发布于 {detail.publishedDate.slice(0, 10)}
            </span>
          )}
          {detail.province && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {detail.province}
            </span>
          )}
        </div>
      </Card>

      {/* 商务条款 */}
      <Card className="rounded-2xl p-6">
        <h2 className="text-sm font-extrabold text-secondary-900 mb-4">商务条款</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TermItem icon={Wallet} label="采购预算" value={formatBudget(detail)} />
          <TermItem icon={Truck} label="贸易术语" value={detail.incoterm} />
          <TermItem icon={CalendarClock} label="交付时间" value={detail.deliveryTime} />
          <TermItem icon={MapPin} label="交付地点" value={detail.deliveryAddress || detail.province} />
          <TermItem icon={Landmark} label="付款方式" value={detail.paymentTerms.join("、")} />
          <TermItem icon={Globe2} label="可见范围" value={detail.visibility === "public" ? "公开询价" : "定向邀约"} />
        </div>
        {detail.supplierReqs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-secondary-400 mb-2 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 供应商要求
            </p>
            <div className="flex flex-wrap gap-2">
              {detail.supplierReqs.map((req) => (
                <span key={req} className="px-2.5 py-1 rounded-lg bg-secondary-100 text-secondary-600 text-xs font-semibold">
                  {req}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 需求描述 */}
      <Card className="rounded-2xl p-6">
        <h2 className="text-sm font-extrabold text-secondary-900 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary-600" /> 需求描述
        </h2>
        <p className="text-sm text-secondary-700 leading-7 whitespace-pre-wrap">
          {detail.description}
        </p>
      </Card>
    </div>
  );
}
