// i18n-allow-file: 设计预览页（demo 分支，不发布；文案待接入 i18n 后再进主干）
/**
 * 会员套餐页 · 支付与售后改造预览（真实骨架）
 *
 * 说明：产品里支付本就长在 /membership（会员套餐页）里，所以本预览 = 会员套餐页本身：
 *      真实 PlanCard（档位卡/权益矩阵）+ 真实 Modal/Button/SelectableCard 收银台 + 页内「我的订单」；发票统一去费用中心补开。
 *      预览入口之所以是 /design/…，只是因为本地没有数据库、/membership 的服务端取数跑不起来；
 *      确认后改动直接落到 MembershipPage / PlanCard / PaymentModal，不新增独立收银台页面。
 *
 * 数据：mock-plans.json 来自线上 /api/membership/plans 的真实响应（价格/周期/权益矩阵原样），仅用于渲染。
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Building2, Check, ChevronRight, CircleHelp, Clock3, CreditCard, FileText, Landmark, ReceiptText,
} from "lucide-react";
import { Badge, Button, Input, Modal, Select, SelectableCard } from "@/shared/ui";
import { cn } from "@/shared/utils";
import { PlanCard } from "@/features/membership/components/PlanCard";
import type { ComparisonView, PlanView, TieredPlanView } from "@/types";
import mockPlans from "./mock-plans.json";

const DATA = mockPlans as unknown as ComparisonView;
const PERIOD_LABEL: Record<number, string> = { 30: "月付", 90: "季付", 365: "年付" };
const fmt = (n: number | string) => "¥" + Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LEGAL = [
  { name: "《用户服务协议》", href: "/terms" },
  { name: "《付费会员及退款规则》", href: "/refund-policy" },
  { name: "《隐私政策》", href: "/privacy" },
];

export default function MembershipPaymentPreviewPage() {
  const periodDays = useMemo(
    () => [...new Set(DATA.plans.flatMap((p) => (p.periods ?? [p]).map((r) => r.billingPeriodDays).filter((d): d is number => d != null)))].sort((a, b) => a - b),
    [],
  );
  const [activeDays, setActiveDays] = useState<number>(periodDays[0] ?? 30);
  const [payOpen, setPayOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<PlanView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [payMethod, setPayMethod] = useState<"alipay" | "wechat" | "transfer">("alipay");
  const [refundOpen, setRefundOpen] = useState(false);

  const cards = useMemo(() => {
    return DATA.plans.flatMap((tier: TieredPlanView) => {
      const rows = (tier.periods ?? []).length > 0 ? tier.periods! : [tier];
      const row = rows.find((r) => r.billingPeriodDays === activeDays) ?? rows[0];
      return row ? [{ tier, row }] : [];
    });
  }, [activeDays]);

  function openPay(row: PlanView) {
    setTarget(row);
    setAgreed(false);
    setStep(1);
    setPayOpen(true);
  }

  const price = target ? Number(target.price) : 0;
  const periodName = target?.billingPeriodDays != null ? PERIOD_LABEL[target.billingPeriodDays] ?? `${target.billingPeriodDays} 天` : "";

  const Steps = () => (
    <div className="mb-4 flex items-center gap-2 text-xs font-semibold">
      {([[1, "确认订单"], [2, "支付"], [3, "完成"]] as const).map(([n, label], i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-secondary-200" />}
          <span className={cn("flex items-center gap-1.5", step >= n ? "text-primary-700" : "text-secondary-400")}>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", step >= n ? "bg-primary-600 text-white" : "bg-secondary-200 text-secondary-500")}>
              {step > n ? <Check className="h-3 w-3" /> : n}
            </span>
            {label}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 via-white to-primary-50/20 pb-20">
      {/* 预览提示（仅 demo） */}
      <div className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-bold text-white">设计预览</span>
          <span>会员套餐页内支付改造（真实 PlanCard + 真实 Modal；数据取自线上 /api/membership/plans）</span>
          <span className="ml-auto text-amber-700/80">验证后合入 MembershipPage / PlanCard / PaymentModal</span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-500">
          <span>会员中心</span><span className="text-secondary-300">/</span><span className="font-semibold text-secondary-700">会员套餐</span>
          <span className="ml-auto flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />企业已认证：杭州某某进出口有限公司 <Badge variant="soft-success" shape="tag"><BadgeCheck className="h-3 w-3" />已认证</Badge></span>
        </div>

        {/* 标题 + 周期 Tab（复刻 MembershipPage 现有结构） */}
        <div className="mt-5 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-secondary-900 sm:text-3xl">会员套餐与权益</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-secondary-500">
            三档会员 · 月付 / 季付 / 年付。价格含税、支持开票、到期不自动续费；购买前可在确认订单页核对权益、退款条件与开票信息。
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2" role="tablist">
          {periodDays.map((days) => (
            <Button
              key={days}
              type="button"
              role="tab"
              size="sm"
              variant={activeDays === days ? "primary" : "outline"}
              aria-selected={activeDays === days}
              className="px-5 py-2"
              onClick={() => setActiveDays(days)}
            >
              {PERIOD_LABEL[days] ?? `${days} 天`}
            </Button>
          ))}
        </div>

        {/* 真实 PlanCard 网格 */}
        <div className="mt-6 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ tier, row }) => (
            <PlanCard
              key={row.planCode}
              tier={tier}
              row={row}
              table={DATA}
              currentPlanPrice={null}
              currentPlanCode={null}
              upgradeCreditOpen={null}
              onBuy={openPay}
            />
          ))}
        </div>

        {/* 页内补充：交易与合规信息（会员页新增，不再另开页面） */}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            { icon: <ReceiptText className="h-4 w-4" />, title: "发票与开票", lines: ["发票在「费用中心 → 发票管理」统一申请", "支持电子普通发票 / 增值税专用发票，1 个工作日开具", "退款时未开具作废、已开具红冲"] },
            { icon: <Landmark className="h-4 w-4" />, title: "企业采购", lines: ["支持对公转账与合同付款（联系客户经理）", "企业认证主体作为合同与发票主体", "到账后 1 个工作日内开通，订单可追溯"] },
            { icon: <CircleHelp className="h-4 w-4" />, title: "付费与退款", lines: ["7 日内且未下载资料可申请全额退款", "到期不自动续费，到期前站内信/短信提醒", "价格调整提前 7 日公示，已支付订单不受影响"] },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-secondary-200 bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-secondary-900"><span className="text-primary-600">{c.icon}</span>{c.title}</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-secondary-500">
                {c.lines.map((l) => <li key={l} className="flex gap-2"><span className="mt-0.5 text-primary-500">•</span>{l}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-secondary-400">
          付费前请阅读 {LEGAL.map((l, i) => (
            <span key={l.href}>{i > 0 && " · "}<Link href={l.href} className="font-semibold text-primary-700 underline underline-offset-2">{l.name}</Link></span>
          ))}
        </p>

        {/* 页内「我的订单与发票」—— 售后入口不再散落在设置页 */}
        <section className="mt-8 rounded-2xl border border-secondary-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-secondary-100 px-5 py-3">
            <h2 className="text-sm font-extrabold text-secondary-900">我的订单</h2>
            <Badge variant="soft-neutral" shape="tag">近 12 个月</Badge>
            <span className="ml-auto text-xs text-secondary-400">发票请到「费用中心 → 发票管理」申请；退款进度在这里查看</span>
          </div>
          <div className="divide-y divide-secondary-100">
            {[
              { no: "SO202611240001", name: "企业基础会员 · 年付", amount: 4800, status: "已支付", time: "2026-11-24 17:20", refund: true },
              { no: "SO202611180003", name: "个人会员 · 季付", amount: 499, status: "退款处理中", time: "2026-11-18 10:12", refund: false },
              { no: "SO202610050007", name: "个人会员 · 月付", amount: 239, status: "已退款", time: "2026-10-05 09:03", refund: false },
            ].map((o) => (
              <div key={o.no} className="flex flex-wrap items-center gap-3 px-5 py-3 text-xs">
                <span className="font-mono text-secondary-700">{o.no}</span>
                <span className="text-secondary-800">{o.name}</span>
                <span className="text-secondary-400">{o.time}</span>
                <Badge variant={o.status === "已支付" ? "soft-success" : o.status === "已退款" ? "soft-neutral" : "soft-warning"} shape="tag">{o.status}</Badge>
                <span className="ml-auto flex flex-wrap gap-2">
                  <Link href="/design/billing-preview" className="inline-flex items-center gap-1 rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-xs font-bold text-secondary-700 hover:border-primary-400 hover:text-primary-700">去费用中心开票</Link>
                  {o.refund && <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>申请退款</Button>}
                  <Button size="sm" variant="ghost">订单详情</Button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ══ 收银台（同一页内弹窗，三步：确认订单 → 支付 → 完成） ══ */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        closeDisabled={step === 2}
        title={step === 1 ? "确认订单" : step === 2 ? "扫码支付" : "支付成功"}
        className="max-w-xl"
      >
        {step === 1 && target && (
          <div className="space-y-4">
            <Steps />
            <div className="overflow-hidden rounded-xl border border-secondary-200">
              {[
                ["商品", `${target.nameZh}（${PERIOD_LABEL[target.billingPeriodDays ?? 30] ?? ""}）`],
                ["价格", `${fmt(price)}（含税）· 无其他费用`],
                ["服务期限", target.billingPeriodDays ? `${target.billingPeriodDays} 天，自支付成功起算` : "按合同约定"],
                ["生效 / 到期", "支付成功即开通（虚拟服务，立即交付）"],
                ["退款条件", "7 日内且未下载任何资料可全额退款；已下载按已履约处理，详见《付费会员及退款规则》"],
                ["自动续费", "不自动续费，到期后需手动续费"],
              ].map(([k, v], i) => (
                <div key={k} className={cn("grid grid-cols-[5.5rem_1fr] gap-2 px-3 py-2 text-xs", i > 0 && "border-t border-dashed border-secondary-100")}>
                  <span className="font-semibold text-secondary-400">{k}</span>
                  <span className="leading-relaxed text-secondary-800">{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-secondary-200 px-3 py-2.5 text-xs leading-relaxed text-secondary-500">
              <span className="flex items-center gap-1.5 font-bold text-secondary-800"><ReceiptText className="h-3.5 w-3.5 text-primary-600" />发票</span>
              本单支付环节不采集发票信息。支付成功后可在「费用中心 → 发票管理」按实际支付金额申请开票（电子普票 / 增值税专票，1 个工作日内开具）；退款时未开具作废、已开具红冲。
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-3 text-xs leading-relaxed text-secondary-700">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" />
              <span>
                我已阅读并同意
                {LEGAL.map((l) => (
                  <Link key={l.href} href={l.href} target="_blank" className="mx-0.5 font-semibold text-primary-700 underline underline-offset-2">{l.name}</Link>
                ))}
                ，并确认本单为一次性付费、<b>到期不自动续费</b>；已下载资料将影响退款资格。
              </span>
            </label>

            <Button variant="primary" className="w-full" disabled={!agreed} onClick={() => setStep(2)}>下一步：选择支付方式</Button>
            {!agreed && <p className="text-center text-[11px] text-secondary-400">勾选上方协议后继续</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Steps />
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary-50 px-3 py-2 text-xs">
              <span className="font-semibold text-secondary-700">订单号 <span className="font-mono">SO202611240001</span></span>
              <Badge variant="soft-warning" shape="tag"><Clock3 className="h-3 w-3" />剩余 14:59</Badge>
              <span className="ml-auto font-black text-danger-600">{fmt(price)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { key: "alipay", title: "支付宝", desc: "扫码支付", icon: <CreditCard className="h-4 w-4" /> },
                { key: "wechat", title: "微信支付", desc: "扫码支付", icon: <CreditCard className="h-4 w-4" /> },
                { key: "transfer", title: "对公转账", desc: "企业账户", icon: <Landmark className="h-4 w-4" /> },
              ].map((m) => (
                <SelectableCard key={m.key} selected={payMethod === m.key} onClick={() => setPayMethod(m.key as typeof payMethod)} className="rounded-xl p-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-secondary-800"><span className="text-primary-600">{m.icon}</span>{m.title}</span>
                  <span className="mt-0.5 block text-xs text-secondary-400">{m.desc}</span>
                </SelectableCard>
              ))}
            </div>
            {payMethod === "transfer" ? (
              <div className="rounded-xl border border-secondary-200 bg-secondary-50 px-3 py-2.5 text-xs leading-relaxed text-secondary-600">
                <p className="font-bold text-secondary-800">对公转账信息（企业专属账户）</p>
                <p>户名：杭州云境智展科技有限公司 · 开户行：招商银行杭州分行营业部</p>
                <p>账号：5719 **** **** 001（完整账号见合同/客户经理）</p>
                <p className="mt-1 text-amber-700">转账备注填写订单号；到账后 1 个工作日内开通。</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setStep(3)}>模拟到账并开通（Demo）</Button>
              </div>
            ) : (
              <div className="flex gap-4 rounded-xl border border-dashed border-secondary-300 p-3">
                <div className="h-32 w-32 shrink-0 rounded-lg border border-secondary-200 bg-[repeating-conic-gradient(#0f172a_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />
                <div className="text-xs leading-relaxed text-secondary-500">
                  <p className="text-sm font-bold text-secondary-800">请使用{payMethod === "alipay" ? "支付宝" : "微信"}扫码支付</p>
                  <p className="mt-1">应付金额 <b className="text-base text-danger-600">{fmt(price)}</b></p>
                  <p>订单号 SO202611240001</p>
                  <p>支付剩余时间 <b className="text-danger-600">14:59</b></p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setStep(3)}>模拟支付成功（Demo）</Button>
                </div>
              </div>
            )}
            <p className="text-center text-[11px] text-secondary-400">支付即视为确认本单服务内容、退款条件与开票方式；本单不自动续费。</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Steps />
            <div className="rounded-2xl border-2 border-primary-200 bg-primary-50 p-4 text-center">
              <p className="text-lg font-black text-primary-800">支付成功，会员已开通</p>
              <p className="mt-1 text-xs text-primary-700">
                {target?.nameZh} · {periodName} · {fmt(price)}（含税）<br />
                订单号 <span className="font-mono">SO202611240001</span> · 权益至 2027-11-24
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <ReceiptText className="h-4 w-4" />, label: "去费用中心开票", onClick: () => { setPayOpen(false); window.location.assign("/design/billing-preview"); } },
                { icon: <FileText className="h-4 w-4" />, label: "查看订单", onClick: () => setPayOpen(false) },
                { icon: <ChevronRight className="h-4 w-4" />, label: "去使用权益", onClick: () => setPayOpen(false) },
              ].map((a) => (
                <button key={a.label} type="button" onClick={a.onClick} className="flex flex-col items-center gap-1 rounded-xl border border-secondary-200 bg-white px-2 py-3 text-xs font-bold text-secondary-700 hover:border-primary-400 hover:text-primary-700">
                  <span className="text-primary-600">{a.icon}</span>{a.label}
                </button>
              ))}
            </div>
            <Button variant="primary" className="w-full" onClick={() => setPayOpen(false)}>完成</Button>
          </div>
        )}
      </Modal>

      {/* 退款弹窗（页内） */}
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="申请退款" className="max-w-lg">
        <div className="space-y-3">
          <div className="rounded-xl bg-secondary-50 px-3 py-2 text-xs text-secondary-500">订单 SO202611240001 · 可退金额 <b className="text-secondary-900">¥4,800.00</b>（7 日内且未下载资料）</div>
          <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">退款原因</span>
            <Select><option>暂不需要该服务</option><option>购买错误 / 重复购买</option><option>服务未达预期</option><option>其他</option></Select>
          </label>
          <label className="text-xs"><span className="mb-1 block font-semibold text-secondary-600">补充说明（选填）</span>
            <Input placeholder="如权益未到账，请说明时间" />
          </label>
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-[11px] leading-relaxed text-primary-900">
            7 日全额退款规则：支付成功后 7 日内且未发生有效资料下载可全额退款；是否下载以服务器交付日志为准；审核通过后原路退回，已开票订单同步红冲。
          </div>
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => setRefundOpen(false)}>提交退款申请</Button>
            <Button variant="outline" className="flex-1" onClick={() => setRefundOpen(false)}>取消</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


