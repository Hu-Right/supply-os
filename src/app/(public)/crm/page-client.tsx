"use client";

/**
 * CRM 鉴权守卫 + 动态加载
 * CRM Auth Guard + Dynamic Loading
 *
 * @description 未登录用户展示工作台产品介绍页（含登录 CTA），
 *              已登录用户加载完整 CRM 仪表盘。
 *              Unauthenticated users see a product intro page with login CTA;
 *              authenticated users load the full CRM dashboard.
 */

import dynamic from "next/dynamic";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { Briefcase, BarChart3, Calendar, FileText, Users } from "lucide-react";

// CRM 仪表盘 — 仅登录后可见，按需加载
const CrmDashboard = dynamic(
  () => import("@/features/crm").then((m) => (m as any).default || m.CrmPage),
  {
    loading: () => (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
      </div>
    ),
  },
);

/** CRM 产品介绍页 — 未登录访客可见 */
function CrmLandingPage() {
  const { t } = useLocale();

  const features = [
    {
      icon: BarChart3,
      title: "AI 智能商机匹配",
      desc: "基于企业资质与历史数据，自动评估中标概率，输出 Bid/No-Bid 建议",
    },
    {
      icon: Calendar,
      title: "截止日历与任务管理",
      desc: "可视化投标时间节点，团队分工协作，避免错过关键截止日期",
    },
    {
      icon: FileText,
      title: "文档中心与证据库",
      desc: "集中管理投标文件、资质证书、历史业绩，支持权限与版本管理",
    },
    {
      icon: Users,
      title: "顾问协同",
      desc: "一对一顾问在线协作，专家建议与陪跑支持，降低投标风险",
    },
  ];

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center py-16 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-100 mb-6">
          <Briefcase className="w-8 h-8 text-teal-600" />
        </div>

        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-3">
          AI 投标工作台
        </h2>
        <p className="text-base text-slate-600 mb-8 max-w-xl mx-auto">
          登录后使用完整的投标管理工具：AI 商机评估、截止日历、团队协作、文档中心与顾问支持。
          让 OS 成为您的日常投标工作台。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 text-left">
          {features.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <f.icon className="w-5 h-5 text-teal-600 mb-2" />
              <h3 className="text-sm font-bold text-slate-800 mb-1">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => emitAppEvent("supply-os:require-login")}
            className="font-bold"
          >
            登录使用工作台
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => emitAppEvent("supply-os:require-login")}
            className="font-bold"
          >
            免费注册账号
          </Button>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          已有账号？登录后即可同步您的商机收藏、搜索提醒与企业资料。
        </p>
      </div>
    </div>
  );
}

export default function CrmPageClient() {
  const { authUser } = useAuth();

  // 未登录 → 展示产品介绍页
  if (!authUser) {
    return <CrmLandingPage />;
  }

  // 已登录 → 加载 CRM 仪表盘
  return <CrmDashboard />;
}
