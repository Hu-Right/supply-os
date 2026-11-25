// i18n-allow-file: 账号中心概览页（一期，文案待统一接入 i18n 7 语）
/**
 * 账号概览（/settings）— 对标阿里云/腾讯云账号中心首页
 *
 * 只做“摘要 + 跳转”：身份（供应商主体 / 采购主体是两套主体）、账号安全、待办、入口。
 * 订单/账单/发票/续费不在概览里重复展示，统一去费用中心。
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, ChevronRight, Lock, ReceiptText, ShieldCheck, ShoppingCart, Smartphone, User,
} from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Badge } from "@/shared/ui";
import { useMembershipTier } from "@/shared/hooks/useMembershipTier";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import { classifyEnterpriseBindState, enterpriseBindStateText } from "@/shared/utils/enterprise-status";
import { fetchMyBuyer, type BuyerInfo } from "@/features/procurement-demand/api";

const maskPhone = (v?: string | null) => {
  if (!v) return "";
  return v.length > 7 ? `${v.slice(0, 3)}****${v.slice(-4)}` : v;
};

const buyerStatusText = (buyer: BuyerInfo | null): { text: string; verified: boolean } => {
  if (!buyer) return { text: "未认证", verified: false };
  if (buyer.status === "verified") return { text: "已核验", verified: true };
  if (buyer.status === "pending") return { text: "审核中", verified: false };
  if (buyer.status === "rejected") return { text: "未通过", verified: false };
  return { text: "待完善", verified: false };
};

export function AccountOverview() {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const { tierLabel } = useMembershipTier();
  const enterprise = useEnterpriseInfo();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [buyerLoading, setBuyerLoading] = useState(true);

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    setBuyerLoading(true);
    fetchMyBuyer()
      .then((b) => { if (!cancelled) setBuyer(b); })
      .catch(() => { if (!cancelled) setBuyer(null); })
      .finally(() => { if (!cancelled) setBuyerLoading(false); });
    return () => { cancelled = true; };
  }, [authUser]);

  if (!authUser) {
    return (
      <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
        <p className="text-sm font-bold text-foreground">请先登录后查看账号概览</p>
        <p className="mt-1.5 text-xs text-muted-foreground">登录后可管理个人信息、账号安全、企业认证与费用发票。</p>
      </div>
    );
  }

  const bindState = classifyEnterpriseBindState(enterprise.enterprise ?? null);
  const bindText = enterpriseBindStateText(bindState);
  const companyName = enterprise.enterprise ? String(enterprise.enterprise.company || "") : "";
  const supplierVerified = bindState === "verified";
  const buyerState = buyerStatusText(buyer);
  const hasPhone = Boolean(authUser.phone);
  const hasEmail = Boolean(authUser.email);

  const todos = [
    !hasPhone && { text: "绑定手机号，用于登录验证与到期/安全提醒", action: "去绑定", href: "/settings/security" },
    !hasEmail && { text: "绑定邮箱，用于接收发票与通知", action: "去绑定", href: "/settings/security" },
    !enterprise.bound && { text: "完成供应商主体认证，解锁投标与企业能力展示", action: "去认证", href: "/settings/enterprise" },
    bindState === "pending" && { text: "供应商主体审核中，审核通过后可开具企业发票", action: "查看进度", href: "/settings/enterprise" },
    !buyer && { text: "完成采购主体认证，解锁采购需求发布", action: "去认证", href: "/settings/buyer" },
    buyer?.status === "pending" && { text: "采购主体审核中，通过后可正式发布采购需求", action: "查看进度", href: "/settings/buyer" },
  ].filter(Boolean) as Array<{ text: string; action: string; href: string }>;

  return (
    <div className="space-y-6">
      {/* 账号头卡 */}
      <section className="rounded-xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <User className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
              {authUser.nickname || authUser.email || "未命名账号"}
              <Badge variant={isVip ? "soft-warning" : "soft-neutral"} shape="tag">
                {isVip ? tierLabel || t("authVipMember") : t("authFreeMember")}
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {authUser.email || "未绑定邮箱"} · {maskPhone(authUser.phone) || "未绑定手机"}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href="/settings/profile" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary-50">编辑个人信息</Link>
            <Link href="/settings/security" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary-50">账号安全</Link>
            <Link href="/settings/billing" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">费用中心</Link>
          </div>
        </div>
      </section>

      {/* 身份（两套主体）+ 账号安全 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/settings/enterprise" className="group rounded-xl border border-border bg-white p-5 hover:border-brand-300">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><BadgeCheck className="h-4 w-4 text-brand-600" />供应商主体</p>
          <p className="mt-2 text-sm font-bold text-foreground">
            {enterprise.loading ? "加载中…" : supplierVerified ? companyName || "已认证" : enterprise.bound ? t(bindText.key) || bindText.fallback : "未认证"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {supplierVerified ? "可开具专票、参与投标与企业能力展示" : "完成认证后可参与投标、展示企业能力"}
          </p>
          <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600">管理供应商主体<ChevronRight className="h-3 w-3" /></span>
        </Link>

        <Link href="/settings/buyer" className="group rounded-xl border border-border bg-white p-5 hover:border-brand-300">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShoppingCart className="h-4 w-4 text-brand-600" />采购主体</p>
          <p className="mt-2 text-sm font-bold text-foreground">
            {buyerLoading ? "加载中…" : buyerState.text}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {buyerState.verified ? "可正式发布采购需求、发起询价" : "完成采购主体认证后可正式发布采购需求"}
          </p>
          <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600">管理采购主体<ChevronRight className="h-3 w-3" /></span>
        </Link>

        <Link href="/settings/security" className="group rounded-xl border border-border bg-white p-5 hover:border-brand-300">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="h-4 w-4 text-brand-600" />账号安全</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-bold text-foreground">
            {hasPhone ? "已绑定手机" : "未绑定手机"}<span className="text-muted-foreground">·</span>{hasEmail ? "已绑定邮箱" : "未绑定邮箱"}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3 w-3" />{maskPhone(authUser.phone) || "手机号用于登录与安全提醒"}</p>
          <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600">管理安全设置<ChevronRight className="h-3 w-3" /></span>
        </Link>
      </div>

      {/* 待办 */}
      <section className="rounded-xl border border-border bg-white">
        <div className="border-b border-border px-5 py-3">
          <p className="text-sm font-bold text-foreground">待办与提醒</p>
        </div>
        {todos.length === 0 ? (
          <p className="px-5 py-6 text-xs text-muted-foreground">暂无待办，账号状态良好。</p>
        ) : (
          <div className="divide-y divide-border/70">
            {todos.map((todo) => (
              <div key={todo.text} className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs">
                <span className="text-foreground">{todo.text}</span>
                <Link href={todo.href} className="ml-auto font-semibold text-brand-600">{todo.action} →</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 快捷入口：费用唯一入口 + 账号相关，不再重复会员/订单 */}
      <section className="rounded-xl border border-border bg-white p-5">
        <p className="text-sm font-bold text-foreground">常用入口</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { label: "个人信息", href: "/settings/profile", icon: <User className="h-4 w-4" /> },
            { label: "安全设置", href: "/settings/security", icon: <Lock className="h-4 w-4" /> },
            { label: "供应商主体", href: "/settings/enterprise", icon: <BadgeCheck className="h-4 w-4" /> },
            { label: "采购主体认证", href: "/settings/buyer", icon: <ShoppingCart className="h-4 w-4" /> },
            { label: "费用中心", href: "/billing", icon: <ReceiptText className="h-4 w-4" /> },
            { label: "联系客服", href: "/contact", icon: <ShieldCheck className="h-4 w-4" /> },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-foreground hover:border-brand-300 hover:bg-secondary-50">
              <span className="text-brand-600">{item.icon}</span>{item.label}
            </Link>
          ))}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        账号是资产归属、费用结算与权限控制的主体。供应商主体与采购主体是两套独立身份，可同时认证；后续将支持两步验证、登录设备管理与成员权限（二期）。
      </p>
    </div>
  );
}

