// i18n-allow-file: 设计预览页（demo 分支，不发布；文案待接入 i18n 后再进主干）
/**
 * /design/billing-preview — 费用中心预览（仿阿里云/腾讯云「费用与成本」控制台布局）
 *
 * 对标结构：左侧导航 + 顶部三栏总览 + 费用详情 Tab（订单/账单/发票/续费）；
 *          发票管理内再分「开具发票 / 开票记录 / 发票抬头（欠票处理）」。
 *          发票不在支付时采集，统一按已支付消费金额自助申请（一期人工开票）。
 * 骨架：@/shared/ui（Badge/Button/Input/Modal/SegmentedControl/Select）+ 现有设计令牌。
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Bell, Building2, ChevronRight, Clock3, Download, Filter, Home, ListOrdered,
  ReceiptText, RefreshCw, Search, ShoppingCart, TrendingUp, Wallet,
} from "lucide-react";
import { Badge, Button, Input, Modal, SegmentedControl, Select } from "@/shared/ui";
import { cn } from "@/shared/utils";

type View = "overview" | "orders" | "bills" | "invoices" | "renewals";
type InvoiceView = "apply" | "records" | "profile";
const fmt = (n: number) => "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAV: Array<{ key: View; label: string; icon: React.ReactNode }> = [
  { key: "overview", label: "总览", icon: <Home className="h-4 w-4" /> },
  { key: "orders", label: "订单管理", icon: <ShoppingCart className="h-4 w-4" /> },
  { key: "bills", label: "账单明细", icon: <ListOrdered className="h-4 w-4" /> },
  { key: "invoices", label: "发票管理", icon: <ReceiptText className="h-4 w-4" /> },
  { key: "renewals", label: "续费管理", icon: <RefreshCw className="h-4 w-4" /> },
];

const ORDERS = [
  { no: "SO202611240001", name: "企业基础会员 · 年付", amount: 4800, status: "已支付", time: "2026-11-24 17:20" },
  { no: "SO202611180003", name: "个人会员 · 季付", amount: 499, status: "退款处理中", time: "2026-11-18 10:12" },
  { no: "SO202610050007", name: "个人会员 · 月付", amount: 239, status: "已退款", time: "2026-10-05 09:03" },
];

const INVOICES = [
  { no: "FP20261124003", order: "SO202611240001", type: "增值税专用发票", amount: 4800, status: "开票中", time: "2026-11-24 17:25" },
  { no: "FP20261005002", order: "SO202610050007", type: "电子普通发票", amount: 239, status: "已红冲", time: "2026-10-05 09:10" },
  { no: "FP20260918001", order: "SO202609180005", type: "电子普通发票", amount: 499, status: "已开具", time: "2026-09-18 11:20" },
];

export default function BillingCenterPreviewPage() {
  const [view, setView] = useState<View>("overview");
  const [invoiceView, setInvoiceView] = useState<InvoiceView>("apply");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [autoRenew, setAutoRenew] = useState(false);

  const Title = () => (
    <div className="flex flex-wrap items-center gap-2 border-b border-secondary-100 pb-3">
      <h2 className="text-base font-extrabold text-secondary-900">{NAV.find((n) => n.key === view)?.label}</h2>
      <span className="text-xs text-secondary-400">
        {view === "overview" && "账户费用与发票的汇总视图"}
        {view === "orders" && "新购 / 续费 / 升级 / 退款全生命周期"}
        {view === "bills" && "按订单与消费流水核对，可导出对账"}
        {view === "invoices" && "按实际支付金额申请开票，退款红冲"}
        {view === "renewals" && "当前订阅、到期提醒与自动续费"}
      </span>
      <span className="ml-auto flex items-center gap-2 text-xs text-secondary-400">
        <Building2 className="h-3.5 w-3.5" />杭州某某进出口有限公司
        <Badge variant="soft-success" shape="tag"><BadgeCheck className="h-3 w-3" />已认证</Badge>
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary-50 pb-20">
      <div className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-bold text-white">设计预览</span>
          <span>费用中心 · 仿阿里云「费用与成本」结构：左侧导航 + 三栏总览 + 订单/账单/发票/续费</span>
          <Link href="/design/payment-compliance" className="ml-auto rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold">← 返回会员套餐页</Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* 左侧导航（移动端横向） */}
          <aside className="lg:sticky lg:top-16 lg:self-start">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-secondary-200 bg-white p-1.5 lg:flex-col">
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
                  {n.key === "invoices" && <Badge variant="soft-warning" shape="pill" className="ml-auto">1</Badge>}
                </button>
              ))}
            </div>
            <div className="mt-3 hidden rounded-xl border border-secondary-200 bg-white p-4 text-xs leading-relaxed text-secondary-500 lg:block">
              <p className="font-bold text-secondary-800">开票口径</p>
              <p className="mt-1">仅按已支付订单金额开票；充值/未支付不开票；退款时未开具作废、已开具红冲；专票抬头须与实名主体一致。</p>
              <Button size="sm" variant="outline" className="mt-3 w-full justify-center" onClick={() => setInvoiceOpen(true)}>申请开票</Button>
            </div>
          </aside>

          {/* 主内容 */}
          <main className="space-y-4">
            {view === "overview" && (
              <>
                {/* 顶部三栏（阿里云：可用额度 / 可开票金额 / 待还款 → 我们：当前订阅 / 可开票 / 待处理） */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "当前订阅", value: "企业基础会员 · 年付", sub: "有效期至 2027-11-24（剩余 365 天）", icon: <Wallet className="h-4 w-4" />, action: "查看续费", onClick: () => setView("renewals") },
                    { label: "可开票金额", value: fmt(4800), sub: "按已支付订单金额开具", icon: <ReceiptText className="h-4 w-4" />, action: "去开票", onClick: () => { setView("invoices"); setInvoiceView("apply"); }, accent: true },
                    { label: "待处理", value: "1 张发票", sub: "开票中 · 预计 1 个工作日内开具", icon: <Clock3 className="h-4 w-4" />, action: "查看记录", onClick: () => { setView("invoices"); setInvoiceView("records"); } },
                  ].map((c) => (
                    <div key={c.label} className="rounded-2xl border border-secondary-200 bg-white p-4">
                      <p className="flex items-center gap-1.5 text-xs text-secondary-500">{c.icon}{c.label}</p>
                      <p className={cn("mt-1 text-xl font-black tracking-tight", c.accent ? "text-primary-700" : "text-secondary-900")}>{c.value}</p>
                      <p className="mt-1 text-[11px] text-secondary-400">{c.sub}</p>
                      <button type="button" onClick={c.onClick} className="mt-2 flex items-center gap-0.5 text-xs font-bold text-primary-700 hover:text-primary-800">{c.action}<ChevronRight className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>

                {/* 待办提醒 */}
                <div className="rounded-2xl border border-secondary-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-secondary-100 px-4 py-2.5">
                    <Bell className="h-4 w-4 text-accent-500" /><p className="text-sm font-extrabold text-secondary-900">待办与提醒</p>
                  </div>
                  <div className="divide-y divide-secondary-100">
                    {[
                      ["可开票金额 ¥4,800.00，可申请开票（已支付订单 SO202611240001）", "去开票", () => { setView("invoices"); setInvoiceView("apply"); }],
                      ["会员将于 2027-11-24 到期，到期前 7 天将提醒续费；当前未开启自动续费", "去续费", () => setView("renewals")],
                      ["退款单 RF20261124008 处理中，预计 1–3 个工作日原路退回", "查看进度", () => setView("orders")],
                    ].map(([text, action, onClick]) => (
                      <div key={String(text)} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                        <span className="text-secondary-700">{text as string}</span>
                        <button type="button" onClick={onClick as () => void} className="ml-auto font-bold text-primary-700 hover:text-primary-800">{action as string}</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 最近订单 + 开票记录 */}
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-secondary-200 bg-white">
                    <div className="flex items-center justify-between border-b border-secondary-100 px-4 py-2.5">
                      <p className="text-sm font-extrabold text-secondary-900">最近订单</p>
                      <button type="button" onClick={() => setView("orders")} className="text-xs font-bold text-primary-700">全部订单 →</button>
                    </div>
                    <div className="divide-y divide-secondary-100">
                      {ORDERS.slice(0, 2).map((o) => (
                        <div key={o.no} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                          <span className="font-mono text-secondary-600">{o.no}</span>
                          <span className="text-secondary-800">{o.name}</span>
                          <span className="ml-auto font-semibold text-secondary-900">{fmt(o.amount)}</span>
                          <Badge variant={o.status === "已支付" ? "soft-success" : "soft-warning"} shape="tag">{o.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-secondary-200 bg-white">
                    <div className="flex items-center justify-between border-b border-secondary-100 px-4 py-2.5">
                      <p className="text-sm font-extrabold text-secondary-900">开票记录</p>
                      <button type="button" onClick={() => { setView("invoices"); setInvoiceView("records"); }} className="text-xs font-bold text-primary-700">全部记录 →</button>
                    </div>
                    <div className="divide-y divide-secondary-100">
                      {INVOICES.slice(0, 2).map((r) => (
                        <div key={r.no} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                          <span className="font-mono text-secondary-600">{r.no}</span>
                          <span className="text-secondary-700">{r.type}</span>
                          <span className="ml-auto font-semibold text-secondary-900">{fmt(r.amount)}</span>
                          <Badge variant={r.status === "已开具" ? "soft-success" : "soft-warning"} shape="tag">{r.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {view === "orders" && (
              <div className="rounded-2xl border border-secondary-200 bg-white">
                <div className="border-b border-secondary-100 px-4 pt-4"><Title /></div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-secondary-400" />
                    <Input className="w-56 pl-8" placeholder="搜索订单号" />
                  </div>
                  <Select className="w-36"><option>全部状态</option><option>已支付</option><option>退款中</option><option>已退款</option></Select>
                  <Button size="sm" variant="outline"><Filter className="h-4 w-4" />筛选</Button>
                  <Button size="sm" variant="outline" className="ml-auto"><Download className="h-4 w-4" />导出</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse text-sm">
                    <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                      {["订单号", "商品", "金额", "状态", "下单时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
                    </tr></thead>
                    <tbody className="text-xs">
                      {ORDERS.map((o) => (
                        <tr key={o.no} className="border-b border-secondary-100 last:border-0 hover:bg-secondary-50/50">
                          <td className="px-4 py-3 font-mono text-secondary-800">{o.no}</td>
                          <td className="px-4 py-3 text-secondary-800">{o.name}</td>
                          <td className="px-4 py-3 font-semibold text-secondary-900">{fmt(o.amount)}</td>
                          <td className="px-4 py-3"><Badge variant={o.status === "已支付" ? "soft-success" : o.status === "已退款" ? "soft-neutral" : "soft-warning"} shape="tag">{o.status}</Badge></td>
                          <td className="px-4 py-3 text-secondary-500">{o.time}</td>
                          <td className="px-4 py-3">
                            <span className="flex flex-wrap gap-1.5">
                              <Button size="sm" variant="outline">详情</Button>
                              {o.status === "已支付" && <Button size="sm" variant="outline">申请退款</Button>}
                              {o.status === "已支付" && <Button size="sm" variant="outline" onClick={() => { setView("invoices"); setInvoiceView("apply"); }}>去开票</Button>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-xs text-secondary-400">
                  <span>共 3 条</span><span className="flex items-center gap-2"><Button size="sm" variant="outline" disabled>上一页</Button><Button size="sm" variant="outline" disabled>下一页</Button></span>
                </div>
              </div>
            )}

            {view === "bills" && (
              <div className="rounded-2xl border border-secondary-200 bg-white">
                <div className="border-b border-secondary-100 px-4 pt-4"><Title /></div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <Select className="w-36"><option>2026-11</option><option>2026-10</option><option>2026-09</option></Select>
                  <Select className="w-36"><option>全部类型</option><option>订单支付</option><option>退款</option></Select>
                  <Button size="sm" variant="outline"><TrendingUp className="h-4 w-4" />按月汇总</Button>
                  <Button size="sm" variant="outline" className="ml-auto"><Download className="h-4 w-4" />导出 CSV</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                      {["时间", "类型", "说明", "金额", "状态"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
                    </tr></thead>
                    <tbody className="text-xs">
                      {[
                        ["2026-11-24 17:20", "订单支付", "企业基础会员 · 年付", `+${fmt(4800)}`, "已支付"],
                        ["2026-11-18 10:12", "订单支付", "个人会员 · 季付", `+${fmt(499)}`, "已退款"],
                        ["2026-11-18 10:20", "退款", "个人会员 · 季付 退款", `-${fmt(499)}`, "已完成"],
                        ["2026-10-05 09:03", "订单支付", "个人会员 · 月付", `+${fmt(239)}`, "已退款"],
                      ].map((r) => (
                        <tr key={r[0] + r[2]} className="border-b border-secondary-100 last:border-0 hover:bg-secondary-50/50">
                          {r.map((c, i) => <td key={i} className={cn("px-4 py-3", i === 0 || i === 3 ? "font-mono text-secondary-700" : "text-secondary-500")}>{c}</td>)}
                        </tr>
                      ))}
                      <tr className="bg-secondary-50 text-xs font-bold text-secondary-800">
                        <td className="px-4 py-2.5" colSpan={3}>本期合计（净消费）</td>
                        <td className="px-4 py-2.5 font-mono">{fmt(5039)}</td>
                        <td className="px-4 py-2.5" />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-3 text-[11px] text-secondary-400">账单按订单/退款流水列示；发票申请按已支付金额计算，不受退款流水影响。</p>
              </div>
            )}

            {view === "invoices" && (
              <div className="rounded-2xl border border-secondary-200 bg-white">
                <div className="border-b border-secondary-100 px-4 pt-4"><Title /></div>
                <div className="px-4 py-3">
                  <SegmentedControl
                    items={[
                      { value: "apply", label: "开具发票" },
                      { value: "records", label: "开票记录" },
                      { value: "profile", label: "发票抬头" },
                    ]}
                    value={invoiceView}
                    onChange={(v) => setInvoiceView(v as InvoiceView)}
                  />
                </div>

                {invoiceView === "apply" && (
                  <div className="grid gap-4 px-4 pb-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-xl border border-secondary-200 p-4">
                      <p className="text-xs text-secondary-500">可开票金额（实际支付含税金额）</p>
                      <p className="mt-1 text-3xl font-black tracking-tight text-secondary-900">{fmt(4800)}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-secondary-400">仅按已支付订单开票；充值/未支付不开票；退款已开票部分自动红冲。</p>
                      <Button variant="primary" className="mt-3 w-full" onClick={() => setInvoiceOpen(true)}>申请开票</Button>
                      {submitted && <p className="mt-2 rounded-lg bg-primary-50 px-2 py-1.5 text-[11px] font-semibold text-primary-700">已提交，发票开具中（1 个工作日内发送至邮箱）</p>}
                    </div>
                    <div className="rounded-xl border border-secondary-200">
                      <div className="border-b border-secondary-100 px-4 py-2.5 text-sm font-extrabold text-secondary-900">可开票订单（勾选后合并开票）</div>
                      <table className="w-full border-collapse text-xs">
                        <thead><tr className="bg-secondary-50 text-left text-secondary-500">
                          <th className="w-10 border-b border-secondary-200 px-3 py-2"> </th>
                          {["订单号", "商品", "可开票金额", "支付时间"].map((h) => <th key={h} className="border-b border-secondary-200 px-3 py-2 font-bold">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          <tr className="border-b border-secondary-100">
                            <td className="px-3 py-2.5"><input type="checkbox" defaultChecked className="h-4 w-4 accent-primary-600" /></td>
                            <td className="px-3 py-2.5 font-mono text-secondary-700">SO202611240001</td>
                            <td className="px-3 py-2.5 text-secondary-800">企业基础会员 · 年付</td>
                            <td className="px-3 py-2.5 font-semibold text-secondary-900">{fmt(4800)}</td>
                            <td className="px-3 py-2.5 text-secondary-500">2026-11-24 17:20</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="px-3 py-2 text-[11px] text-secondary-400">勾选订单后点「申请开票」，按合计金额开具；也可按账单月份合并开具。</p>
                    </div>
                  </div>
                )}

                {invoiceView === "records" && (
                  <div className="overflow-x-auto px-0 pb-2">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                        {["开票单号", "关联订单", "类型", "金额", "状态", "申请时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-2.5 font-bold">{h}</th>)}
                      </tr></thead>
                      <tbody className="text-xs">
                        {INVOICES.map((r) => (
                          <tr key={r.no} className="border-b border-secondary-100 last:border-0">
                            <td className="px-4 py-3 font-mono text-secondary-800">{r.no}</td>
                            <td className="px-4 py-3 font-mono text-secondary-500">{r.order}</td>
                            <td className="px-4 py-3 text-secondary-700">{r.type}</td>
                            <td className="px-4 py-3 font-semibold text-secondary-900">{fmt(r.amount)}</td>
                            <td className="px-4 py-3"><Badge variant={r.status === "已开具" ? "soft-success" : r.status === "已红冲" ? "soft-neutral" : "soft-warning"} shape="tag">{r.status}</Badge></td>
                            <td className="px-4 py-3 text-secondary-500">{r.time}</td>
                            <td className="px-4 py-3"><Button size="sm" variant="outline" disabled={r.status === "开票中"}>{r.status === "已开具" ? "下载" : r.status === "已红冲" ? "查看红冲" : "查看进度"}</Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {invoiceView === "profile" && (
                  <div className="grid gap-4 px-4 pb-5 lg:grid-cols-2">
                    <div className="rounded-xl border border-secondary-200 p-4">
                      <p className="flex items-center gap-1.5 text-sm font-extrabold text-secondary-900"><ReceiptText className="h-4 w-4 text-primary-600" />默认发票抬头（企业实名主体）</p>
                      <div className="mt-3 space-y-1.5 text-xs text-secondary-500">
                        <p>单位名称：<b className="text-secondary-800">杭州某某进出口有限公司</b></p>
                        <p>统一社会信用代码：<b className="text-secondary-800">91330110MAEQC7N58T</b></p>
                        <p>注册地址与电话：<b className="text-secondary-800">浙江省杭州市余杭区… / 0571-8xxxxxxx</b></p>
                        <p>接收邮箱：<b className="text-secondary-800">finance@example.com</b></p>
                      </div>
                      <Button size="sm" variant="outline" className="mt-3">编辑发票抬头</Button>
                      <p className="mt-2 text-[11px] leading-relaxed text-secondary-400">专票抬头须与实名主体一致；企业实名变更后，不能就变更前消费补开。</p>
                    </div>
                    <div className="rounded-xl border border-secondary-200 p-4 text-xs leading-relaxed text-secondary-500">
                      <p className="text-sm font-extrabold text-secondary-900">欠票 / 红冲提示</p>
                      <p className="mt-2">退款、降配或退订会产生负向可开票金额（欠票），可用新消费冲抵；已开具发票在退款后自动进入红冲流程。</p>
                      <div className="mt-3 rounded-lg bg-secondary-50 px-3 py-2">
                        <p className="flex justify-between"><span>当前欠票</span><span className="font-bold text-secondary-900">{fmt(0)}</span></p>
                        <p className="mt-1 flex justify-between"><span>待红冲</span><span className="font-bold text-secondary-900">0 张</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === "renewals" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-secondary-200 bg-white">
                  <div className="border-b border-secondary-100 px-4 pt-4"><Title /></div>
                  <div className="space-y-2 p-4 text-xs">
                    <p className="flex justify-between"><span className="text-secondary-500">当前套餐</span><span className="font-bold text-secondary-900">企业基础会员 · 年付</span></p>
                    <p className="flex justify-between"><span className="text-secondary-500">生效 / 到期</span><span className="font-bold text-secondary-900">2026-11-24 / 2027-11-24</span></p>
                    <p className="flex justify-between"><span className="text-secondary-500">剩余</span><span className="font-bold text-secondary-900">365 天</span></p>
                    <p className="flex justify-between"><span className="text-secondary-500">续费价格</span><span className="font-bold text-secondary-900">{fmt(4800)}（含税）</span></p>
                  </div>
                  <div className="mx-4 mb-4 flex items-center justify-between rounded-xl border border-secondary-200 bg-secondary-50 px-3 py-2.5">
                    <div>
                      <p className="flex items-center gap-1 text-xs font-bold text-secondary-800">自动续费 <Badge variant="soft-neutral" shape="tag">默认关闭</Badge></p>
                      <p className="mt-0.5 text-[11px] text-secondary-400">开启后到期前 5 日提醒并自动扣费，可随时关闭</p>
                    </div>
                    <button type="button" role="switch" aria-checked={autoRenew} onClick={() => setAutoRenew((v) => !v)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", autoRenew ? "bg-primary-600" : "bg-secondary-300")}>
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", autoRenew ? "translate-x-5" : "translate-x-0.5")} />
                    </button>
                  </div>
                  <div className="flex gap-2 px-4 pb-4">
                    <Link href="/design/payment-compliance" className="flex-1"><Button variant="primary" size="sm" className="w-full justify-center">立即续费</Button></Link>
                    <Button variant="outline" size="sm" className="flex-1 justify-center">升级套餐</Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-secondary-200 bg-white p-4 text-xs leading-relaxed text-secondary-500">
                  <p className="text-sm font-extrabold text-secondary-900">续费与到期规则</p>
                  <ul className="mt-2 space-y-2">
                    <li>到期前 7 天、3 天、当天站内信 + 短信提醒，不自动扣费。</li>
                    <li>到期后服务停止但数据保留 30 天，续费后恢复权益。</li>
                    <li>升级按剩余价值抵扣；降级在下一周期生效。</li>
                    <li>退款：7 日内且未下载资料可全额退款；已开票同步红冲。</li>
                  </ul>
                  <div className="mt-4 rounded-xl border border-secondary-200">
                    <div className="border-b border-secondary-100 px-3 py-2 text-xs font-bold text-secondary-800">续费记录</div>
                    <div className="divide-y divide-secondary-100">
                      {[["2026-11-24", "企业基础会员 · 年付", fmt(4800)], ["2025-11-24", "企业基础会员 · 年付", fmt(4800)]].map((r) => (
                        <div key={r[0]} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                          <span className="text-secondary-500">{r[0]}</span><span className="text-secondary-700">{r[1]}</span><span className="ml-auto font-semibold text-secondary-900">{r[2]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 申请开票弹窗 */}
      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="申请开票" className="max-w-lg">
        <div className="space-y-3">
          <div className="rounded-xl bg-secondary-50 px-3 py-2 text-xs text-secondary-500">可开票金额 <b className="text-secondary-900">{fmt(4800)}</b>（按已支付订单金额开具；退款订单未开具作废、已开具红冲）</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">发票类型</span>
              <Select defaultValue="special"><option value="special">增值税专用发票</option><option value="normal">电子普通发票</option></Select>
            </label>
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">接收邮箱</span><Input defaultValue="finance@example.com" /></label>
            <label className="text-xs sm:col-span-2"><span className="mb-1 block font-semibold text-secondary-600">发票抬头（与实名主体一致）</span><Input defaultValue="杭州某某进出口有限公司" /></label>
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">税号</span><Input defaultValue="91330110MAEQC7N58T" /></label>
            <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">注册地址与电话</span><Input placeholder="专票必填" /></label>
          </div>
          <Button variant="primary" className="w-full" onClick={() => { setInvoiceOpen(false); setSubmitted(true); }}>提交开票申请</Button>
          <p className="text-center text-[11px] text-secondary-400">提交后进入开票队列，1 个工作日内开具；可在「开票记录」查看进度。</p>
        </div>
      </Modal>
    </div>
  );
}

