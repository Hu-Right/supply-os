// i18n-allow-file: 费用中心一期（财务域文案，待法务/翻译审校后统一接入 i18n 7 语）
/**
 * 费用中心（/billing）— 控制台式布局：总览 / 订单管理 / 账单明细 / 发票管理 / 续费管理
 *
 * 数据：订单复用 /api/payment/orders，订阅复用 /api/membership/status，
 *      企业主体复用 /api/user/enterprise，发票申请走 /api/billing/invoices。
 * 开票口径：仅按已支付订单金额申请，支付环节不采集发票；一期财务人工开具。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Bell, Building2, ChevronRight, Clock3, Download, Home, ListOrdered, Loader2,
  ReceiptText, RefreshCw, ShoppingCart, Wallet,
} from "lucide-react";
import { Badge, Button, Input, Modal, Select } from "@/shared/ui";
import { cn } from "@/shared/utils";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { fetchOrders } from "@/features/payment/api";
import type { OrderRecord } from "@/features/payment/api";
import { fetchMembershipStatus } from "@/core/api/membership";
import type { MembershipStatusView } from "@/types/membership";
import type { InvoiceRequestView, CreateInvoiceRequestInput } from "@/types/billing";
import { fetchInvoiceRequests, createInvoiceRequest, downloadInvoiceFile, searchCompanyTitles } from "./api";
import type { CompanyLookupItem } from "./api";

type View = "overview" | "orders" | "bills" | "invoices" | "renewals";

const fmt = (n: number) => "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOnly = (v?: string | Date | null) => (v ? String(v).slice(0, 10) : "-");
const INVOICE_STATUS_LABEL: Record<string, string> = {
  pending: "待开票",
  issuing: "开票中",
  issued: "已开具",
  void: "已作废",
  red_flushed: "已红冲",
};
const PLAN_LABEL: Record<string, string> = {
  personal_m: "个人会员 · 月付",
  personal_q: "个人会员 · 季付",
  personal_y: "个人会员 · 年付",
  business_m: "企业会员 · 月付",
  business_q: "企业会员 · 季付",
  business_y: "企业会员 · 年付",
  concierge_m: "人工对接 · 月付",
  concierge_q: "人工对接 · 季付",
  concierge_y: "人工对接 · 年付",
};

/** 历史订单的旧套餐码（orders.product_name 存的是英文码，目录里已下架，仅展示映射用） */
const LEGACY_PLAN_LABEL: Record<string, string> = {
  free: "免费会员",
  starter: "商机体验",
  pro: "个人标准版（已下架）",
  personal_pro_1299: "个人会员 · 年",
  single_89: "单次体验",
  unlimited: "个人商机会员",
  business: "企业商机版",
  advisor: "企业咨询顾问",
  strategic: "战略客户版",
};

/** 订单商品展示名：优先用 order.productName（中文），否则按套餐码映射，最后兜底 */
function orderProductLabel(order: OrderRecord): string {
  const productName = String(order.productName || "").trim();
  if (productName && /[\u4e00-\u9fa5]/.test(productName)) return productName;
  return PLAN_LABEL[order.planCode] ?? LEGACY_PLAN_LABEL[order.planCode]
    ?? (order.planCode ? `会员订单（${order.planCode}）` : "会员订单");
}

interface EnterpriseResult {
  bound: boolean;
  enterprise: { company: string; creditCode: string | null } | null;
}

const NAV: Array<{ key: View; label: string; icon: React.ReactNode }> = [
  { key: "overview", label: "总览", icon: <Home className="h-4 w-4" /> },
  { key: "orders", label: "订单管理", icon: <ShoppingCart className="h-4 w-4" /> },
  { key: "bills", label: "账单明细", icon: <ListOrdered className="h-4 w-4" /> },
  { key: "invoices", label: "发票管理", icon: <ReceiptText className="h-4 w-4" /> },
  { key: "renewals", label: "续费管理", icon: <RefreshCw className="h-4 w-4" /> },
];

export function BillingCenter() {
  const { authUser } = useAuth();
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [status, setStatus] = useState<MembershipStatusView | null>(null);
  const [enterprise, setEnterprise] = useState<EnterpriseResult | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRequestView[]>([]);

  // 开票弹窗
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<"normal" | "special">("normal");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [email, setEmail] = useState("");
  const [addressPhone, setAddressPhone] = useState("");
  const [buyerType, setBuyerType] = useState<"enterprise" | "personal">("enterprise");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyLookupItem[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [showCompanyOptions, setShowCompanyOptions] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OrderRecord | null>(null);

  const load = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setError("");
    const [orderRes, statusRes, entRes, invoiceRes] = await Promise.allSettled([
      fetchOrders({ limit: 50 }),
      fetchMembershipStatus(true),
      api<EnterpriseResult>("/api/user/enterprise"),
      fetchInvoiceRequests(),
    ]);
    if (orderRes.status === "fulfilled") setOrders(orderRes.value.list ?? []);
    else setError("订单加载失败，请刷新重试");
    if (statusRes.status === "fulfilled") setStatus(statusRes.value);
    if (entRes.status === "fulfilled") setEnterprise(entRes.value);
    if (invoiceRes.status === "fulfilled") setInvoices(invoiceRes.value);
    setLoading(false);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    void load();
  }, [authUser, load]);

  useEffect(() => {
    if (enterprise?.enterprise) {
      setInvoiceTitle((v) => v || enterprise.enterprise?.company || "");
      setTaxNo((v) => v || enterprise.enterprise?.creditCode || "");
    }
  }, [enterprise]);

  const paidOrders = useMemo(() => orders.filter((o) => o.status === "paid"), [orders]);
  const invoicedOrderNos = useMemo(
    () => new Set(invoices.flatMap((i) => i.orderNos)),
    [invoices],
  );
  const eligibleOrders = useMemo(
    () => paidOrders.filter((o) => !invoicedOrderNos.has(o.orderNo)),
    [paidOrders, invoicedOrderNos],
  );
  const payable = useMemo(
    () => eligibleOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0),
    [eligibleOrders],
  );
  const pendingInvoices = invoices.filter((i) => i.status === "pending" || i.status === "issuing").length;
  const subscription = status?.subscription ?? null;
  const subPlanLabel = status?.plan?.nameZh
    || (subscription?.planCode ? PLAN_LABEL[subscription.planCode] ?? subscription.planCode : "");
  const hasActivePlan = Boolean(status?.plan);
  const expiresAt = dateOnly(subscription?.expiresAt ?? null);

  // 账单流水：支付为正、退款为负（按订单状态近似，真实退款金额以退款单为准）
  const bills = useMemo(
    () =>
      orders
        .map((o) => ({
          time: dateOnly(o.paidAt ?? o.createdAt),
          type: o.status === "refunded" ? "退款" : "订单支付",
          desc: `${orderProductLabel(o)}（${o.orderNo}）`,
          amount: o.status === "refunded" ? -Number(o.amount || 0) : Number(o.amount || 0),
          status: o.status,
        }))
        .sort((a, b) => (a.time < b.time ? 1 : -1)),
    [orders],
  );
  const netAmount = bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);

  const openInvoice = () => {
    setInvoiceType("normal");
    setSelectedOrders(eligibleOrders.map((o) => o.orderNo));
    setSubmitError("");
    setSubmitted(false);
    setInvoiceOpen(true);
  };

  const selectedAmount = useMemo(
    () =>
      eligibleOrders
        .filter((o) => selectedOrders.includes(o.orderNo))
        .reduce((sum, o) => sum + Number(o.amount || 0), 0),
    [eligibleOrders, selectedOrders],
  );

  const handleTitleChange = (value: string) => {
    setInvoiceTitle(value);
    // 手工改名后旧税号可能不匹配，清空重新检索/填写
    setTaxNo("");
    setShowCompanyOptions(value.trim().length >= 2);
  };

  const selectCompany = (item: CompanyLookupItem) => {
    setInvoiceTitle(item.title);
    setTaxNo(item.taxNo);
    setShowCompanyOptions(false);
  };

  // 企业抬头检索（防抖 300ms；失败静默，不阻塞手工填写）
  useEffect(() => {
    if (!invoiceOpen || buyerType !== "enterprise") {
      setCompanyOptions([]);
      setShowCompanyOptions(false);
      return;
    }
    const keyword = invoiceTitle.trim();
    if (keyword.length < 2) {
      setCompanyOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCompanyLoading(true);
      try {
        const items = await searchCompanyTitles(keyword);
        if (!cancelled) {
          setCompanyOptions(items);
          setShowCompanyOptions(items.length > 0);
        }
      } catch {
        if (!cancelled) setCompanyOptions([]);
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [invoiceTitle, invoiceOpen, buyerType]);

  const submitInvoice = async () => {
    setSubmitError("");
    if (selectedOrders.length === 0) {
      setSubmitError("请至少勾选一笔可开票订单");
      return;
    }
    if (!invoiceTitle.trim() || !email.trim()) {
      setSubmitError(buyerType === "personal" ? "请填写个人姓名与接收邮箱" : "请填写发票抬头与接收邮箱");
      return;
    }
    if (buyerType === "enterprise" && invoiceType === "special"
      && (!taxNo.trim() || !addressPhone.trim() || !phone.trim())) {
      setSubmitError("增值税专用发票需填写税号、注册地址与联系电话");
      return;
    }
    const input: CreateInvoiceRequestInput = {
      orderNos: selectedOrders,
      amount: Number(selectedAmount.toFixed(2)),
      invoiceType: buyerType === "personal" ? "normal" : invoiceType,
      title: invoiceTitle.trim(),
      taxNo: buyerType === "personal" ? null : taxNo.trim() || null,
      email: email.trim(),
      addressPhone: buyerType === "personal" ? null : addressPhone.trim() || null,
      buyerType,
      phone: phone.trim() || null,
      bankName: buyerType === "personal" ? null : bankName.trim() || null,
      bankAccount: buyerType === "personal" ? null : bankAccount.trim() || null,
    };
    setSubmitting(true);
    try {
      const created = await createInvoiceRequest(input);
      setInvoices((prev) => [created, ...prev]);
      setInvoiceOpen(false);
      setSubmitted(true);
      setView("invoices");
    } catch {
      setSubmitError("提交失败，请稍后重试或联系客服");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authUser) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-lg font-extrabold text-secondary-900">请先登录后查看费用中心</p>
        <p className="mt-2 text-sm text-secondary-500">登录后可查看订单、账单、发票申请与续费信息。</p>
        <Link href="/" className="mt-4 inline-block"><Button variant="primary">返回首页登录</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 面包屑：账号中心 / 费用中心（并入账号中心布局，不再是独立控制台） */}
      <div className="flex items-center gap-1 text-xs text-secondary-400">
        <Link href="/settings" className="hover:text-secondary-600">账号中心</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-secondary-600">费用中心</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-extrabold tracking-tight text-secondary-900">费用中心</h1>
        {enterprise?.bound && (
          <Badge variant="soft-success" shape="tag"><BadgeCheck className="h-3 w-3" />企业已认证</Badge>
        )}
        {enterprise?.enterprise && (
          <span className="flex items-center gap-1 text-xs text-secondary-500">
            <Building2 className="h-3.5 w-3.5" />{enterprise.enterprise.company}
            {enterprise.enterprise.creditCode ? ` · ${enterprise.enterprise.creditCode}` : ""}
          </span>
        )}
      </div>

      {/* 页内 Tab（不再用独立控制台左侧导航） */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-secondary-200 bg-white p-1.5">
        {NAV.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => setView(n.key)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              view === n.key ? "bg-primary-50 text-primary-700" : "text-secondary-600 hover:bg-secondary-50",
            )}
          >
            {n.icon}{n.label}
            {n.key === "invoices" && pendingInvoices > 0 && (
              <Badge variant="soft-warning" shape="pill" className="ml-auto">{pendingInvoices}</Badge>
            )}
          </button>
        ))}
      </div>

      <main className="space-y-4">
            {loading && (
              <div className="flex items-center gap-2 rounded-2xl border border-secondary-200 bg-white px-4 py-10 text-sm text-secondary-500">
                <Loader2 className="h-4 w-4 animate-spin" />正在加载费用数据…
              </div>
            )}
            {!loading && error && (
              <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
            )}

            {!loading && !error && view === "overview" && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "当前订阅", icon: <Wallet className="h-4 w-4" />,
                      value: subPlanLabel || "暂无生效订阅",
                      sub: expiresAt !== "-" ? `有效期至 ${expiresAt}` : hasActivePlan ? "长期有效（无到期时间）" : "可在会员套餐页购买",
                      action: "查看续费", onClick: () => setView("renewals"), accent: false,
                    },
                    {
                      label: "可开票金额", icon: <ReceiptText className="h-4 w-4" />,
                      value: fmt(payable), sub: "按已支付订单实付金额",
                      action: "去开票", onClick: openInvoice, accent: true,
                    },
                    {
                      label: "待处理发票", icon: <Clock3 className="h-4 w-4" />,
                      value: `${pendingInvoices} 张`, sub: pendingInvoices ? "开票中，预计 1 个工作日内完成" : "暂无待处理发票",
                      action: "查看记录", onClick: () => setView("invoices"), accent: false,
                    },
                  ].map((c) => (
                    <div key={c.label} className="rounded-2xl border border-secondary-200 bg-white p-4">
                      <p className="flex items-center gap-1.5 text-xs text-secondary-500">{c.icon}{c.label}</p>
                      <p className={cn("mt-1 truncate text-xl font-black tracking-tight", c.accent ? "text-primary-700" : "text-secondary-900")}>{c.value}</p>
                      <p className="mt-1 text-[11px] text-secondary-400">{c.sub}</p>
                      <button type="button" onClick={c.onClick} className="mt-2 flex items-center gap-0.5 text-xs font-bold text-primary-700 hover:text-primary-800">{c.action}<ChevronRight className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-secondary-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-secondary-100 px-4 py-2.5">
                    <Bell className="h-4 w-4 text-accent-500" /><p className="text-sm font-extrabold text-secondary-900">待办与提醒</p>
                  </div>
                  <div className="divide-y divide-secondary-100">
                    {payable > 0 && (
                      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                        <span className="text-secondary-700">可开票金额 {fmt(payable)}，可申请开票（{eligibleOrders.length} 笔已支付订单）</span>
                        <button type="button" onClick={openInvoice} className="ml-auto font-bold text-primary-700">去开票</button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                      <span className="text-secondary-700">
                        {expiresAt !== "-"
                          ? `会员将于 ${expiresAt} 到期，到期前 7 天将提醒续费；当前未开启自动续费`
                          : hasActivePlan
                            ? `当前订阅「${subPlanLabel}」长期有效，无到期时间`
                            : "当前没有生效中的会员订阅"}
                      </span>
                      <Link href="/membership" className="ml-auto font-bold text-primary-700">
                        {expiresAt !== "-" ? "去续费" : hasActivePlan ? "查看会员套餐" : "去开通"}
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                      <span className="text-secondary-700">退款/售后可在「订单管理」查看，或联系客服提交退款申请；已开票订单退款时同步红冲。</span>
                      <button type="button" onClick={() => setView("orders")} className="ml-auto font-bold text-primary-700">查看订单</button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-secondary-200 bg-white">
                    <div className="flex items-center justify-between border-b border-secondary-100 px-4 py-2.5">
                      <p className="text-sm font-extrabold text-secondary-900">最近订单</p>
                      <button type="button" onClick={() => setView("orders")} className="text-xs font-bold text-primary-700">全部订单 →</button>
                    </div>
                    <div className="divide-y divide-secondary-100">
                      {orders.slice(0, 3).map((o) => (
                        <div key={o.orderNo} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                          <span className="font-mono text-secondary-600">{o.orderNo}</span>
                          <span className="truncate text-secondary-800">{orderProductLabel(o)}</span>
                          <span className="ml-auto font-semibold text-secondary-900">{fmt(Number(o.amount || 0))}</span>
                          <Badge variant={o.status === "paid" ? "soft-success" : o.status === "refunded" ? "soft-neutral" : "soft-warning"} shape="tag">{statusLabel(o.status)}</Badge>
                        </div>
                      ))}
                      {orders.length === 0 && <p className="px-4 py-6 text-center text-xs text-secondary-400">暂无订单</p>}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-secondary-200 bg-white">
                    <div className="flex items-center justify-between border-b border-secondary-100 px-4 py-2.5">
                      <p className="text-sm font-extrabold text-secondary-900">开票记录</p>
                      <button type="button" onClick={() => setView("invoices")} className="text-xs font-bold text-primary-700">全部记录 →</button>
                    </div>
                    <div className="divide-y divide-secondary-100">
                      {invoices.slice(0, 3).map((r) => (
                        <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                          <span className="font-mono text-secondary-600">#{r.id}</span>
                          <span className="text-secondary-700">{r.invoiceType === "special" ? "增值税专用发票" : "电子普通发票"}</span>
                          <span className="ml-auto font-semibold text-secondary-900">{fmt(r.amount)}</span>
                          <Badge variant={r.status === "issued" ? "soft-success" : r.status === "void" || r.status === "red_flushed" ? "soft-neutral" : "soft-warning"} shape="tag">{INVOICE_STATUS_LABEL[r.status] ?? r.status}</Badge>
                        </div>
                      ))}
                      {invoices.length === 0 && <p className="px-4 py-6 text-center text-xs text-secondary-400">暂无开票记录</p>}
                    </div>
                  </div>
                </div>
              </>
            )}

            {!loading && !error && view === "orders" && (
              <div className="rounded-2xl border border-secondary-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-secondary-100 px-4 py-3">
                  <h2 className="text-base font-extrabold text-secondary-900">订单管理</h2>
                  <span className="text-xs text-secondary-400">新购 / 续费 / 退款全生命周期</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse text-sm">
                    <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                      {["订单号", "商品", "金额", "状态", "支付时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
                    </tr></thead>
                    <tbody className="text-xs">
                      {orders.map((o) => (
                        <tr key={o.orderNo} className="border-b border-secondary-100 last:border-0">
                          <td className="px-4 py-3 font-mono text-secondary-800">{o.orderNo}</td>
                          <td className="px-4 py-3 text-secondary-800">{orderProductLabel(o)}</td>
                          <td className="px-4 py-3 font-semibold text-secondary-900">{fmt(Number(o.amount || 0))}</td>
                          <td className="px-4 py-3"><Badge variant={o.status === "paid" ? "soft-success" : o.status === "refunded" ? "soft-neutral" : "soft-warning"} shape="tag">{statusLabel(o.status)}</Badge></td>
                          <td className="px-4 py-3 text-secondary-500">{dateOnly(o.paidAt ?? o.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className="flex flex-wrap items-center gap-2 text-xs">
                              <button type="button" onClick={() => setDetailOrder(o)} className="font-semibold text-primary-700 hover:underline">详情</button>
                              {o.status === "paid" && !invoicedOrderNos.has(o.orderNo) && (
                                <>
                                  <span className="text-secondary-300">|</span>
                                  <button type="button" onClick={openInvoice} className="font-semibold text-primary-700 hover:underline">申请开票</button>
                                </>
                              )}
                              {o.status === "paid" && (
                                <>
                                  <span className="text-secondary-300">|</span>
                                  <Link href="/complaint" className="font-semibold text-secondary-500 hover:text-primary-700 hover:underline">售后</Link>
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-secondary-400">暂无订单</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && !error && view === "bills" && (
              <div className="rounded-2xl border border-secondary-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-secondary-100 px-4 py-3">
                  <h2 className="text-base font-extrabold text-secondary-900">账单明细</h2>
                  <span className="text-xs text-secondary-400">按支付/退款流水核对</span>
                  <span className="ml-auto"><Button size="sm" variant="outline" disabled><Download className="h-4 w-4" />导出（二期）</Button></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                      {["时间", "类型", "说明", "金额", "状态"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
                    </tr></thead>
                    <tbody className="text-xs">
                      {bills.map((b, i) => (
                        <tr key={`${b.time}-${i}`} className="border-b border-secondary-100 last:border-0">
                          <td className="px-4 py-3 font-mono text-secondary-700">{b.time}</td>
                          <td className="px-4 py-3 text-secondary-500">{b.type}</td>
                          <td className="px-4 py-3 text-secondary-700">{b.desc}</td>
                          <td className={cn("px-4 py-3 font-mono", b.amount < 0 ? "text-danger-600" : "text-secondary-800")}>{b.amount < 0 ? "-" : "+"}{fmt(Math.abs(b.amount))}</td>
                          <td className="px-4 py-3"><Badge variant={b.status === "paid" ? "soft-success" : b.status === "refunded" ? "soft-neutral" : "soft-warning"} shape="tag">{statusLabel(b.status)}</Badge></td>
                        </tr>
                      ))}
                      <tr className="bg-secondary-50 text-xs font-bold text-secondary-800">
                        <td className="px-4 py-2.5" colSpan={3}>已支付订单合计（可开票口径）</td>
                        <td className="px-4 py-2.5 font-mono">{fmt(netAmount)}</td>
                        <td className="px-4 py-2.5" />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-3 text-[11px] text-secondary-400">账单由订单流水聚合展示；退款金额以退款单为准，导出与按月汇总为二期能力。</p>
              </div>
            )}

            {!loading && !error && view === "invoices" && (
              <>
                {submitted && (
                  <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-xs font-semibold text-primary-800">
                    开票申请已提交，财务将在 1 个工作日内开具并发送至邮箱。
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-secondary-200 bg-white p-5">
                    <p className="text-xs text-secondary-500">可开票金额（已支付订单实付合计）</p>
                    <p className="mt-1 text-3xl font-black tracking-tight text-secondary-900">{fmt(payable)}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-secondary-400">仅按已支付订单开票；退款订单不可开；专票抬头须与企业实名主体一致。</p>
                    <Button variant="primary" className="mt-4 w-full" onClick={openInvoice} disabled={eligibleOrders.length === 0}>申请开票</Button>
                    {eligibleOrders.length === 0 && <p className="mt-2 text-center text-[11px] text-secondary-400">暂无可开票订单</p>}
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-secondary-200 bg-white">
                    <table className="w-full min-w-[680px] border-collapse text-sm">
                      <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                        {["申请单", "关联订单", "类型", "金额", "发票号", "状态", "申请时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
                      </tr></thead>
                      <tbody className="text-xs">
                        {invoices.map((r) => (
                          <tr key={r.id} className="border-b border-secondary-100 last:border-0">
                            <td className="px-4 py-3 font-mono text-secondary-800">#{r.id}</td>
                            <td className="px-4 py-3 font-mono text-secondary-500">{r.orderNos.join("、")}</td>
                            <td className="px-4 py-3 text-secondary-700">{r.invoiceType === "special" ? "增值税专用发票" : "电子普通发票"}</td>
                            <td className="px-4 py-3 font-semibold text-secondary-900">{fmt(r.amount)}</td>
                            <td className="px-4 py-3 font-mono text-secondary-700">{r.invoiceNo || "-"}</td>
                            <td className="px-4 py-3"><Badge variant={r.status === "issued" ? "soft-success" : r.status === "void" || r.status === "red_flushed" ? "soft-neutral" : "soft-warning"} shape="tag">{INVOICE_STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                            <td className="px-4 py-3 text-secondary-500">{dateOnly(r.createdAt)}</td>
                            <td className="px-4 py-3">
                              {r.status === "issued" && r.invoiceFileUrl ? (
                                <button
                                  type="button"
                                  onClick={() => void downloadInvoiceFile(r.invoiceFileUrl!, `invoice_${r.invoiceNo || r.id}.${r.fileType || "pdf"}`)}
                                  className="font-semibold text-primary-700 hover:underline"
                                >
                                  下载发票
                                </button>
                              ) : (
                                <span className="text-secondary-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {invoices.length === 0 && (
                          <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-secondary-400">暂无开票记录，可点击左侧「申请开票」</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!loading && !error && view === "renewals" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-secondary-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-secondary-900">当前订阅</h2>
                    <Badge variant={subscription ? "soft-success" : "soft-neutral"} shape="tag">{subscription ? "生效中" : "未订阅"}</Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="flex justify-between"><span className="text-secondary-500">套餐</span><span className="font-bold text-secondary-900">{subPlanLabel || "—"}</span></p>
                    <p className="flex justify-between"><span className="text-secondary-500">到期时间</span><span className="font-bold text-secondary-900">{expiresAt !== "-" ? expiresAt : "长期有效"}</span></p>
                    <p className="flex justify-between"><span className="text-secondary-500">自动续费</span><span className="font-bold text-secondary-900">未开启（暂不支持自助开启）</span></p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link href="/membership" className="flex-1"><Button variant="primary" size="sm" className="w-full justify-center">{subscription ? "立即续费" : "去开通"}</Button></Link>
                    <Link href="/membership" className="flex-1"><Button variant="outline" size="sm" className="w-full justify-center">升级套餐</Button></Link>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-secondary-400">到期前 7 天、3 天、当天通过站内信与短信提醒；到期后服务停止但数据保留 30 天，续费后自动恢复。</p>
                </div>
                <div className="rounded-2xl border border-secondary-200 bg-white p-5 text-xs leading-relaxed text-secondary-500">
                  <h2 className="text-base font-extrabold text-secondary-900">续费与退款规则</h2>
                  <ul className="mt-2 space-y-2">
                    <li>续费/升级在会员套餐页完成；升级按剩余价值抵扣，降级在下一周期生效。</li>
                    <li>退款按《付费会员及退款规则》：7 日内且未下载资料可申请全额退款。</li>
                    <li>已开票订单退款时同步红冲；未开具发票的订单作废。</li>
                    <li>发票在「发票管理」按实际支付金额申请，一期人工开具（1 个工作日）。</li>
                  </ul>
                </div>
              </div>
            )}
          </main>

      {/* 订单详情 */}
      <Modal open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)} title="订单详情" className="max-w-md">
        {detailOrder && (
          <div className="space-y-3">
            <div className="divide-y divide-secondary-100 rounded-xl border border-secondary-200 text-xs">
              {[
                ["订单号", detailOrder.orderNo],
                ["商品", orderProductLabel(detailOrder)],
                ["金额", fmt(Number(detailOrder.amount || 0))],
                ["状态", statusLabel(detailOrder.status)],
                ["支付时间", dateOnly(detailOrder.paidAt ?? detailOrder.createdAt)],
                ["业务类型", detailOrder.businessType === "membership" ? "会员订阅" : detailOrder.businessType === "training" ? "培训课程" : detailOrder.businessType === "service" ? "专业服务" : "学习资料"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-secondary-400">{k}</span>
                  <span className="font-semibold text-secondary-800">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {detailOrder.status === "paid" && !invoicedOrderNos.has(detailOrder.orderNo) && (
                <Button variant="primary" className="flex-1" onClick={() => { setDetailOrder(null); openInvoice(); }}>申请开票</Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => setDetailOrder(null)}>关闭</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 申请开票 */}
      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="申请开票" className="max-w-lg">
        <div className="space-y-3">
          <div className="rounded-xl bg-secondary-50 px-3 py-2 text-xs text-secondary-500">
            可开票金额 <b className="text-secondary-900">{fmt(payable)}</b>；本次选择 <b className="text-secondary-900">{fmt(selectedAmount)}</b>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-secondary-200 p-2">
            {eligibleOrders.map((o) => (
              <label key={o.orderNo} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-secondary-50">
                <input
                  type="checkbox"
                  checked={selectedOrders.includes(o.orderNo)}
                  onChange={(e) =>
                    setSelectedOrders((prev) => (e.target.checked ? [...prev, o.orderNo] : prev.filter((n) => n !== o.orderNo)))
                  }
                  className="h-4 w-4 accent-primary-600"
                />
                <span className="font-mono text-secondary-600">{o.orderNo}</span>
                <span className="truncate text-secondary-700">{orderProductLabel(o)}</span>
                <span className="ml-auto font-semibold text-secondary-900">{fmt(Number(o.amount || 0))}</span>
              </label>
            ))}
            {eligibleOrders.length === 0 && <p className="px-2 py-4 text-center text-xs text-secondary-400">暂无可开票订单</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">购买方类型</span>
              <Select value={buyerType} onChange={(e) => {
                const next = e.target.value as "enterprise" | "personal";
                setBuyerType(next);
                if (next === "personal") setInvoiceType("normal");
              }}>
                <option value="enterprise">企业（单位）</option>
                <option value="personal">个人</option>
              </Select>
            </label>
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">发票类型</span>
              <Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as "normal" | "special")} disabled={buyerType === "personal"}>
                <option value="special">增值税专用发票</option>
                <option value="normal">电子普通发票</option>
              </Select>
            </label>
            <div className="relative text-xs sm:col-span-2">
              <span className="mb-1 block font-semibold text-secondary-600">{buyerType === "personal" ? "个人姓名" : "发票抬头（企业名称）"}</span>
              {buyerType === "personal" ? (
                <Input value={invoiceTitle} onChange={(e) => handleTitleChange(e.target.value)} placeholder="个人姓名" />
              ) : (
                <>
                  <Input
                    value={invoiceTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onFocus={() => { if (invoiceTitle.trim().length >= 2 && companyOptions.length > 0) setShowCompanyOptions(true); }}
                    onBlur={() => { window.setTimeout(() => setShowCompanyOptions(false), 150); }}
                    placeholder="输入公司名称检索，选中后自动带出税号"
                  />
                  {showCompanyOptions && (companyLoading || companyOptions.length > 0) && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-secondary-200 bg-white py-1 shadow-xl">
                      {companyLoading && companyOptions.length === 0 && (
                        <p className="flex items-center gap-2 px-3 py-2 text-[11px] text-secondary-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />检索中…</p>
                      )}
                      {companyOptions.map((item) => (
                        <button
                          key={item.taxNo}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCompany(item)}
                          className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-secondary-50"
                        >
                          <span className="text-xs font-semibold text-secondary-900">{item.title}</span>
                          <span className="font-mono text-[11px] text-secondary-400">{item.taxNo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="mt-1 block text-[11px] text-secondary-400">输入 2 个字以上自动检索；选中公司后自动填写税号，也可手工填写。</span>
                </>
              )}
            </div>
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">接收邮箱</span><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="finance@example.com" /></label>
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">联系电话</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号或座机" /></label>
            {buyerType === "enterprise" && (
              <>
                <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">税号</span><Input value={taxNo} onChange={(e) => setTaxNo(e.target.value)} placeholder="统一社会信用代码" /></label>
                <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">注册地址（专票必填）</span><Input value={addressPhone} onChange={(e) => setAddressPhone(e.target.value)} placeholder="注册地址" /></label>
                <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">开户行（选填）</span><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="如：中国建设银行杭州余杭支行" /></label>
                <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">银行账号（选填）</span><Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="对公账户；客户财务要求完整票面时填写" /></label>
              </>
            )}
            {buyerType === "personal" && <p className="self-end text-[11px] text-secondary-400 sm:col-span-2">个人抬头仅支持电子普通发票。</p>}
          </div>
          {submitError && <p className="rounded-lg bg-danger-50 px-2 py-1.5 text-[11px] font-semibold text-danger-700">{submitError}</p>}
          <Button variant="primary" className="w-full" disabled={submitting} onClick={() => void submitInvoice()}>
            {submitting ? "提交中…" : "提交开票申请"}
          </Button>
          <p className="text-center text-[11px] text-secondary-400">提交后 1 个工作日内开具并发送至邮箱；退款时未开具作废、已开具红冲。</p>
        </div>
      </Modal>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "paid") return "已支付";
  if (status === "refunded") return "已退款";
  if (status === "pending") return "待支付";
  if (status === "closed") return "已关闭";
  return status;
}






