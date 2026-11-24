// i18n-allow-file: 设计预览页（demo 分支，不发布；文案待接入 i18n 后再进主干）
/**
 * /design/billing-preview — 费用中心预览（真实骨架）
 *
 * 定位：支付仍在会员套餐页内完成；发票不随支付采集，统一到「费用中心 → 发票管理」补开
 *       （对标阿里云/腾讯云/智谱/DeepSeek：支付后按实际消费自助申请开票）。
 * 骨架：@/shared/ui（Badge/Button/Input/Modal/SegmentedControl/Select）+ 现有设计令牌。
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Building2, Clock3, FileText, ReceiptText,
} from "lucide-react";
import { Badge, Button, Input, Modal, SegmentedControl, Select } from "@/shared/ui";
import { cn } from "@/shared/utils";

type Tab = "orders" | "invoices" | "bills" | "renewals";
const fmt = (n: number) => "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ORDERS = [
  { no: "SO202611240001", name: "企业基础会员 · 年付", amount: 4800, status: "已支付", time: "2026-11-24 17:20", actions: ["申请退款", "订单详情"] },
  { no: "SO202611180003", name: "个人会员 · 季付", amount: 499, status: "退款处理中", time: "2026-11-18 10:12", actions: ["退款进度", "订单详情"] },
  { no: "SO202610050007", name: "个人会员 · 月付", amount: 239, status: "已退款", time: "2026-10-05 09:03", actions: ["订单详情"] },
];

const INVOICES = [
  { no: "FP20261124003", order: "SO202611240001", type: "增值税专用发票", amount: 4800, status: "开票中", time: "2026-11-24 17:25" },
  { no: "FP20261005002", order: "SO202610050007", type: "电子普通发票", amount: 239, status: "已红冲", time: "2026-10-05 09:10" },
  { no: "FP20260918001", order: "SO202609180005", type: "电子普通发票", amount: 499, status: "已开具", time: "2026-09-18 11:20" },
];

export default function BillingCenterPreviewPage() {
  const [tab, setTab] = useState<Tab>("invoices");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [autoRenew, setAutoRenew] = useState(false);

  return (
    <div className="min-h-screen bg-secondary-50 pb-20">
      <div className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-bold text-white">设计预览</span>
          <span>费用中心 · 发票不随支付采集，统一在这里按实际消费补开（真实骨架 + 现有令牌）</span>
          <Link href="/design/payment-compliance" className="ml-auto rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold">← 返回会员套餐页</Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-secondary-900">费用中心</h1>
          <Badge variant="soft-success" shape="tag"><BadgeCheck className="h-3 w-3" />企业已认证</Badge>
          <span className="flex items-center gap-1 text-xs text-secondary-500"><Building2 className="h-3.5 w-3.5" />杭州某某进出口有限公司 · 91330110MAEQC7N58T</span>
        </div>

        {/* 概览 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "累计消费（含税）", value: fmt(5538), icon: <FileText className="h-4 w-4" /> },
            { label: "可开票金额", value: fmt(4800), icon: <ReceiptText className="h-4 w-4" />, accent: true },
            { label: "发票处理中", value: "1 张", icon: <Clock3 className="h-4 w-4" /> },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-secondary-200 bg-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs text-secondary-500">{s.icon}{s.label}</p>
              <p className={cn("mt-1 text-2xl font-black tracking-tight", s.accent ? "text-primary-700" : "text-secondary-900")}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <SegmentedControl
            items={[
              { value: "orders", label: "订单管理" },
              { value: "invoices", label: "发票管理" },
              { value: "bills", label: "账单明细" },
              { value: "renewals", label: "续费管理" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />
        </div>

        {tab === "orders" && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-secondary-200 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                {["订单号", "商品", "金额", "状态", "下单时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-3 font-bold">{h}</th>)}
              </tr></thead>
              <tbody className="text-xs">
                {ORDERS.map((o) => (
                  <tr key={o.no} className="border-b border-secondary-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-secondary-800">{o.no}</td>
                    <td className="px-4 py-3 text-secondary-800">{o.name}</td>
                    <td className="px-4 py-3 font-semibold text-secondary-900">{fmt(o.amount)}</td>
                    <td className="px-4 py-3"><Badge variant={o.status === "已支付" ? "soft-success" : o.status === "已退款" ? "soft-neutral" : "soft-warning"} shape="tag">{o.status}</Badge></td>
                    <td className="px-4 py-3 text-secondary-500">{o.time}</td>
                    <td className="px-4 py-3"><span className="flex flex-wrap gap-1.5">{o.actions.map((a) => <Button key={a} size="sm" variant="outline">{a}</Button>)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "invoices" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-secondary-200 bg-white p-5">
              <p className="text-xs text-secondary-500">可开票金额（实际支付含税金额）</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-secondary-900">{fmt(4800)}</p>
              <p className="mt-1 text-xs leading-relaxed text-secondary-400">开票口径：仅按已支付订单开票，充值/未支付订单不开票；退款订单已开具部分自动红冲。</p>
              <Button variant="primary" className="mt-4 w-full" onClick={() => setInvoiceOpen(true)}>申请开票</Button>
              {submitted && <p className="mt-2 rounded-lg bg-primary-50 px-2 py-1.5 text-[11px] font-semibold text-primary-700">已提交，发票开具中（1 个工作日内发送至邮箱）</p>}
              <p className="mt-2 text-[11px] leading-relaxed text-secondary-400">支持电子普通发票 / 增值税专用发票；专票抬头与实名主体一致。</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-secondary-200 bg-white">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                  {["开票单号", "关联订单", "类型", "金额", "状态", "申请时间", "操作"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-3 font-bold">{h}</th>)}
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
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" disabled={r.status === "开票中"}>{r.status === "已开具" ? "下载" : r.status === "已红冲" ? "查看红冲" : "查看进度"}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-[11px] text-secondary-400">发票开具后发送至申请邮箱，也可在此下载；企业实名主体变更后不能就变更前消费开票。</p>
            </div>
          </div>
        )}

        {tab === "bills" && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-secondary-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead><tr className="bg-secondary-50 text-left text-xs text-secondary-500">
                {["时间", "类型", "说明", "金额", "状态"].map((h) => <th key={h} className="border-b border-secondary-200 px-4 py-3 font-bold">{h}</th>)}
              </tr></thead>
              <tbody className="text-xs">
                {[
                  ["2026-11-24 17:20", "订单支付", "企业基础会员 · 年付", `+${fmt(4800)}`, "已支付"],
                  ["2026-11-18 10:12", "订单支付", "个人会员 · 季付", `+${fmt(499)}`, "已退款"],
                  ["2026-11-18 10:20", "退款", "个人会员 · 季付 退款", `-${fmt(499)}`, "已完成"],
                  ["2026-10-05 09:03", "订单支付", "个人会员 · 月付", `+${fmt(239)}`, "已退款"],
                ].map((r) => (
                  <tr key={r[0] + r[2]} className="border-b border-secondary-100 last:border-0">
                    {r.map((c, i) => <td key={i} className={cn("px-4 py-3", i === 0 || i === 3 ? "font-mono text-secondary-700" : "text-secondary-500")}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[11px] text-secondary-400">账单按订单/退款流水列示；如需按开票主体导出明细，可在发票管理导出。</p>
          </div>
        )}

        {tab === "renewals" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-secondary-200 bg-white p-5">
              <div className="flex items-center justify-between"><p className="text-sm font-extrabold text-secondary-900">当前订阅</p><Badge variant="soft-success" shape="tag">生效中</Badge></div>
              <div className="mt-3 space-y-2 text-xs">
                <p className="flex justify-between"><span className="text-secondary-500">套餐</span><span className="font-bold text-secondary-900">企业基础会员 · 年付</span></p>
                <p className="flex justify-between"><span className="text-secondary-500">到期时间</span><span className="font-bold text-secondary-900">2027-11-24</span></p>
                <p className="flex justify-between"><span className="text-secondary-500">续费价格</span><span className="font-bold text-secondary-900">{fmt(4800)}（含税）</span></p>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-secondary-200 bg-secondary-50 px-3 py-2.5">
                <div>
                  <p className="flex items-center gap-1 text-xs font-bold text-secondary-800">自动续费 <Badge variant="soft-neutral" shape="tag">默认关闭</Badge></p>
                  <p className="mt-0.5 text-[11px] text-secondary-400">开启后到期前 5 日提醒并自动扣费，可随时关闭</p>
                </div>
                <button type="button" role="switch" aria-checked={autoRenew} onClick={() => setAutoRenew((v) => !v)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", autoRenew ? "bg-primary-600" : "bg-secondary-300")}>
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", autoRenew ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href="/design/payment-compliance" className="flex-1"><Button variant="primary" size="sm" className="w-full justify-center">立即续费</Button></Link>
                <Button variant="outline" size="sm" className="flex-1 justify-center">升级套餐</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-secondary-200 bg-white p-5 text-xs leading-relaxed text-secondary-500">
              <p className="font-extrabold text-secondary-900">到期提醒与规则</p>
              <ul className="mt-2 space-y-2">
                <li>到期前 7 天、3 天、当天站内信 + 短信提醒，不自动扣费。</li>
                <li>到期后服务停止但数据保留 30 天，续费后恢复权益。</li>
                <li>升级套餐按剩余价值抵扣；降级在下一周期生效。</li>
                <li>退款按《付费会员及退款规则》：7 日内且未下载资料可全额退款；已开票同步红冲。</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 开票弹窗 */}
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
          <p className="text-center text-[11px] text-secondary-400">提交后进入开票队列，1 个工作日内开具；开具前可在开票记录中查看进度。</p>
        </div>
      </Modal>
    </div>
  );
}

